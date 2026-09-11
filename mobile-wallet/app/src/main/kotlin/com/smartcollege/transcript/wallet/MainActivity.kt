package com.smartcollege.transcript.wallet

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.smartcollege.transcript.wallet.data.IssuerClient
import com.smartcollege.transcript.wallet.data.SecureStore
import com.smartcollege.transcript.wallet.data.WalletRepository
import com.smartcollege.transcript.wallet.ui.CredentialDetailScreen
import com.smartcollege.transcript.wallet.ui.CredentialListScreen
import com.smartcollege.transcript.wallet.ui.OfferScanScreen
import com.smartcollege.transcript.wallet.ui.QualsTheme
import com.smartcollege.transcript.wallet.ui.ReceiveOfferScreen
import com.smartcollege.transcript.wallet.ui.ShareFlowScreen
import com.smartcollege.transcript.wallet.ui.SignInScreen
import kotlinx.coroutines.launch

class MainActivity : FragmentActivity() {
    /**
     * A credential offer opened via deeplink (same-device issuance). Populated
     * from the launch intent and updated by [onNewIntent] when the wallet is
     * already running.
     */
    private val incomingOffer = mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val store = SecureStore(applicationContext)
        val client = IssuerClient(BuildConfig.ISSUER_BASE_URL)
        val repository = WalletRepository(client, store)

        incomingOffer.value = extractOfferUrl(intent)

        setContent {
            QualsTheme {
                WalletApp(
                    repository = repository,
                    activity = this,
                    initialOfferUrl = incomingOffer.value,
                    onOfferConsumed = { incomingOffer.value = null },
                )
            }
        }

        // NOTE: mdocs are now stored behind a user-auth-bound Keystore key, so
        // they cannot be read at cold start (before the user authenticates).
        // Re-publishing to the Android Credential Manager happens after a
        // successful biometric unlock in WalletApp, and after each claim.
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val offer = extractOfferUrl(intent)
        if (offer != null) incomingOffer.value = offer
    }

    /**
     * The OpenID4VCI credential-offer URI from a VIEW intent, if any.
     *
     * Accepts both the `openid-credential-offer://` scheme and an `https://`
     * App Link, since the offer payload is the `credential_offer` query
     * parameter in either case.
     */
    private fun extractOfferUrl(intent: Intent?): String? {
        if (intent?.action != Intent.ACTION_VIEW) return null
        val data = intent.dataString ?: return null
        return if (data.contains("credential_offer=")) data else null
    }
}

sealed interface Screen {
    data object SignIn : Screen
    data object Scan : Screen
    data object List : Screen
    data class Detail(val credentialId: String) : Screen
    data class Share(val credentialId: String) : Screen
    data class Receive(val offerUrl: String) : Screen
}

@Composable
fun WalletApp(
    repository: WalletRepository,
    activity: FragmentActivity,
    initialOfferUrl: String? = null,
    onOfferConsumed: () -> Unit = {},
) {
    var hasCredentials by remember { mutableStateOf(repository.credentialIds().isNotEmpty()) }
    var signedIn by remember { mutableStateOf(repository.isSignedIn()) }
    var unlocked by remember { mutableStateOf(false) }
    var isForeground by remember { mutableStateOf(true) }
    var lastInteraction by remember { mutableLongStateOf(System.currentTimeMillis()) }
    // True while the ML Kit offer scanner (which runs in its own Activity) is
    // open. We must NOT treat that transient overlay as "the user left the
    // wallet": relocking would tear down the scan screen and cancel the
    // claim coroutine before it can reach the network.
    var scannerOpen by remember { mutableStateOf(false) }
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    // Re-lock after this many ms of inactivity while the wallet is in the
    // foreground, so a phone left open on the credential list re-requires
    // biometrics instead of staying visible to anyone nearby.
    val idleLockMs = 60_000L

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> {
                    isForeground = true
                    lastInteraction = System.currentTimeMillis()
                }
                Lifecycle.Event.ON_STOP -> {
                    isForeground = false
                    // Keep the wallet unlocked if the only reason we stopped is
                    // the in-app offer scanner overlay; otherwise re-lock so the
                    // credentials are hidden again when the user leaves.
                    if (signedIn && !scannerOpen) unlocked = false
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // Prompt for biometrics whenever the wallet needs to be unlocked.
    LaunchedEffect(signedIn, unlocked, isForeground) {
        if (signedIn && !unlocked && isForeground) {
            authenticateWallet(
                activity = activity,
                onSuccess = {
                    unlocked = true
                    lastInteraction = System.currentTimeMillis()
                    // After the user authenticates, re-publish stored mdocs so
                    // Chrome can discover them (mdoc decryption needs auth).
                    try {
                        repository.registerWithSystem(activity.applicationContext)
                    } catch (e: Throwable) {
                        // non-fatal
                    }
                },
                onError = { activity.moveTaskToBack(true) },
            )
        }
    }

    // Idle auto-lock: while unlocked & foregrounded, re-lock after inactivity.
    LaunchedEffect(signedIn, unlocked, isForeground) {
        if (signedIn && unlocked && isForeground) {
            while (true) {
                kotlinx.coroutines.delay(1_000)
                if (!unlocked || !isForeground) break
                val idle = System.currentTimeMillis() - lastInteraction
                if (idle > idleLockMs) {
                    unlocked = false
                    break
                }
            }
        }
    }

    if (signedIn && !unlocked) {
        return
    }

    var screen by remember {
        mutableStateOf<Screen>(if (signedIn) Screen.List else Screen.SignIn)
    }

    // A deeplink offer (same-device issuance) takes precedence once the wallet
    // is signed in and unlocked; otherwise the user is sent through sign-in
    // first and lands here afterwards.
    LaunchedEffect(initialOfferUrl, signedIn, unlocked) {
        if (!initialOfferUrl.isNullOrBlank() && signedIn && unlocked) {
            screen = Screen.Receive(initialOfferUrl)
        }
    }

    // Any pointer activity inside the wallet resets the idle auto-lock timer.
    Box(
        Modifier
            .fillMaxSize()
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent()
                        lastInteraction = System.currentTimeMillis()
                    }
                }
            }
    ) {
        when (val current = screen) {
            Screen.SignIn -> SignInScreen(
                repository,
                onSignedIn = {
                    signedIn = true
                    screen = Screen.List
                },
            )
            Screen.Scan -> OfferScanScreen(
                repository,
                onScannerOpenChange = { scannerOpen = it },
                onDone = {
                    scannerOpen = false
                    hasCredentials = repository.credentialIds().isNotEmpty()
                    screen = Screen.List
                },
                onBack = {
                    scannerOpen = false
                    screen = Screen.List
                },
            )
            Screen.List -> CredentialListScreen(
                repository,
                onScan = { screen = Screen.Scan },
                onOpen = { screen = Screen.Detail(it) },
                onSignOut = {
                    val refreshToken = repository.signOut()
                    // Clear the system registry so Chrome can't keep offering
                    // the previous account's credentials after sign-out.
                    repository.registerWithSystem(activity.applicationContext)
                    signedIn = false
                    screen = Screen.SignIn
                    // Best-effort: revoke the refresh token server-side so it
                    // can never be used for token exchange again.
                    if (refreshToken != null) {
                        scope.launch { repository.revokeRefreshToken(refreshToken) }
                    }
                },
            )
            is Screen.Detail -> CredentialDetailScreen(
                repository,
                current.credentialId,
                onBack = {
                    hasCredentials = repository.credentialIds().isNotEmpty()
                    screen = Screen.List
                },
                onShare = { screen = Screen.Share(current.credentialId) },
            )
            is Screen.Share -> ShareFlowScreen(
                repository,
                current.credentialId,
                onDone = { screen = Screen.List },
                onBack = { screen = Screen.Detail(current.credentialId) },
            )
            is Screen.Receive -> ReceiveOfferScreen(
                repository = repository,
                offerUrl = current.offerUrl,
                onDone = {
                    hasCredentials = repository.credentialIds().isNotEmpty()
                    onOfferConsumed()
                    screen = Screen.List
                },
                onCancel = {
                    onOfferConsumed()
                    screen = if (signedIn) Screen.List else Screen.SignIn
                },
            )
        }
    }
}

private fun authenticateWallet(
    activity: FragmentActivity,
    onSuccess: () -> Unit,
    onError: (String) -> Unit,
) {
    val authenticators = BiometricManager.Authenticators.BIOMETRIC_STRONG or
        BiometricManager.Authenticators.DEVICE_CREDENTIAL
    val availability = BiometricManager.from(activity).canAuthenticate(authenticators)
    if (availability != BiometricManager.BIOMETRIC_SUCCESS) {
        onError("Set up biometrics or a device PIN before using the wallet.")
        return
    }

    val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(activity),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                super.onAuthenticationSucceeded(result)
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                super.onAuthenticationError(errorCode, errString)
                onError(errString.toString())
            }
        },
    )
    prompt.authenticate(
        BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Quals")
            .setSubtitle("Use biometrics or device PIN to access credentials")
            .setAllowedAuthenticators(authenticators)
            .build(),
    )
}
