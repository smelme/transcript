package com.smartcollege.transcript.wallet

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.smartcollege.transcript.wallet.data.IssuerClient
import com.smartcollege.transcript.wallet.data.SecureStore
import com.smartcollege.transcript.wallet.data.WalletRepository
import com.smartcollege.transcript.wallet.ui.BrandSplash
import com.smartcollege.transcript.wallet.ui.CredentialDetailScreen
import com.smartcollege.transcript.wallet.ui.CredentialListScreen
import com.smartcollege.transcript.wallet.ui.OfferScanScreen
import com.smartcollege.transcript.wallet.ui.QualsTheme
import com.smartcollege.transcript.wallet.ui.SignInScreen

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val store = SecureStore(applicationContext)
        val client = IssuerClient(BuildConfig.ISSUER_BASE_URL)
        val repository = WalletRepository(client, store)

        setContent {
            QualsTheme {
                var showSplash by remember { mutableStateOf(true) }
                if (showSplash) {
                    BrandSplash(onFinished = { showSplash = false })
                } else {
                    WalletApp(repository, this)
                }
            }
        }

        // Re-publish any already-stored credentials to the Android Credential
        // Manager so Chrome can discover them for org-iso-mdoc presentment.
        Thread { repository.registerWithSystem(applicationContext) }.start()
    }
}

sealed interface Screen {
    data object SignIn : Screen
    data object Scan : Screen
    data object List : Screen
    data class Detail(val credentialId: String) : Screen
}

@Composable
fun WalletApp(repository: WalletRepository, activity: FragmentActivity) {
    var hasCredentials by remember { mutableStateOf(repository.credentialIds().isNotEmpty()) }
    var signedIn by remember { mutableStateOf(repository.isSignedIn()) }
    var unlocked by remember { mutableStateOf(false) }
    var isForeground by remember { mutableStateOf(true) }
    val lifecycleOwner = LocalLifecycleOwner.current

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> isForeground = true
                Lifecycle.Event.ON_STOP -> {
                    isForeground = false
                    if (signedIn && hasCredentials) unlocked = false
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(hasCredentials, signedIn, unlocked, isForeground) {
        if (signedIn && hasCredentials && !unlocked && isForeground) {
            authenticateWallet(
                activity = activity,
                onSuccess = { unlocked = true },
                onError = { activity.moveTaskToBack(true) },
            )
        }
    }

    if (signedIn && hasCredentials && !unlocked) {
        return
    }

    var screen by remember {
        mutableStateOf<Screen>(if (signedIn) Screen.List else Screen.SignIn)
    }

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
            onDone = {
                hasCredentials = repository.credentialIds().isNotEmpty()
                screen = Screen.List
            },
            onBack = { screen = Screen.List },
        )
        Screen.List -> CredentialListScreen(
            repository,
            onScan = { screen = Screen.Scan },
            onOpen = { screen = Screen.Detail(it) },
            onSignOut = {
                repository.signOut()
                signedIn = false
                screen = Screen.SignIn
            },
        )
        is Screen.Detail -> CredentialDetailScreen(
            repository,
            current.credentialId,
            onBack = {
                hasCredentials = repository.credentialIds().isNotEmpty()
                screen = Screen.List
            },
        )
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
