package com.smartcollege.transcript.wallet.presentation

import android.content.Intent
import android.os.Bundle
import android.security.keystore.UserNotAuthenticatedException
import android.util.Log
import androidx.activity.compose.setContent
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.credentials.DigitalCredential
import androidx.credentials.ExperimentalDigitalCredentialApi
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetDigitalCredentialOption
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.CallingAppInfo
import androidx.credentials.provider.PendingIntentHandler
import androidx.fragment.app.FragmentActivity
import com.smartcollege.transcript.wallet.data.SecureStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Exported, non-launcher activity that fulfills an Android Credential Manager
 * `org-iso-mdoc` request on behalf of the wallet. It verifies the caller
 * origin, discloses the requested claims, requires biometric/device-credential
 * authentication, and returns an encrypted DeviceResponse.
 */
@OptIn(ExperimentalDigitalCredentialApi::class)
class PresentationActivity : FragmentActivity() {

    private companion object {
        private const val TAG = "PresentationActivity"
    }

    // Trusted browsers/apps allowed to attest a web origin (see
    // androidx.credentials.provider.CallingAppInfo#getOrigin). Chrome stable
    // and Google Play Services are allow-listed for local e2e testing;
    // remove or restrict before shipping a release build.
    private val privilegedAllowList = """
        {
          "apps": [
            {
              "type": "android",
              "info": {
                "package_name": "com.android.chrome",
                "signatures": [
                  {
                    "build": "release",
                    "cert_fingerprint_sha256": "F0:FD:6C:5B:41:0F:25:CB:25:C3:B5:33:46:C8:97:2F:AE:30:F8:EE:74:11:DF:91:04:80:AD:6B:2D:60:DB:83"
                  }
                ]
              }
            },
            {
              "type": "android",
              "info": {
                "package_name": "com.google.android.gms",
                "signatures": [
                  {
                    "build": "release",
                    "cert_fingerprint_sha256": "F0:FD:6C:5B:41:0F:25:CB:25:C3:B5:33:46:C8:97:2F:AE:30:F8:EE:74:11:DF:91:04:80:AD:6B:2D:60:DB:83"
                  },
                  {
                    "build": "release",
                    "cert_fingerprint_sha256": "7C:E8:3C:1B:71:F3:D5:72:FE:D0:4C:8D:40:C5:CB:10:FF:75:E6:D8:7D:9D:F6:FB:D5:3F:04:68:C2:90:50:53"
                  }
                ]
              }
            }
          ]
        }
    """.trimIndent()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Log.d(TAG, "onCreate action=${intent.action}")

        val store = SecureStore(applicationContext)
        val credentialIds = try {
            store.credentialIds()
        } catch (e: Throwable) {
            Log.e(TAG, "credentialIds() failed", e)
            emptyList()
        }
        val credentialId = credentialIds.firstOrNull()
        Log.d(TAG, "credentialIds=$credentialIds first=$credentialId")

        // NOTE: the mdoc itself is NOT read here. Its bytes are encrypted with a
        // user-auth-bound Keystore key, so they are only decryptable immediately
        // after a successful biometric/PIN prompt (see PresentmentFlow).
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    if (credentialId == null) {
                        MissingCredentialScreen(onClose = { finishWithFailure("No academic credential stored") })
                    } else {
                        PresentmentFlow(
                            activity = this,
                            store = store,
                            credentialId = credentialId,
                        )
                    }
                }
            }
        }
    }

    @Composable
    private fun PresentmentFlow(
        activity: PresentationActivity,
        store: SecureStore,
        credentialId: String,
    ) {
        var origin by remember { mutableStateOf<String?>(null) }
        var requestData by remember { mutableStateOf<Pair<String, String>?>(null) } // (deviceRequest, encryptionInfo)
        var error by remember { mutableStateOf<String?>(null) }
        var authenticated by remember { mutableStateOf(false) }

        fun parseRequest() {
            try {
                val credentialRequest =
                    PendingIntentHandler.retrieveProviderGetCredentialRequest(activity.intent)
                        ?: error("No credential request")
                origin = resolveOrigin(credentialRequest.callingAppInfo)
                val option = credentialRequest.credentialOptions[0] as GetDigitalCredentialOption
                val root = Json.parseToJsonElement(option.requestJson).jsonObject
                val orgIsoMdoc = root["requests"]!!.jsonArray
                    .map { it.jsonObject }
                    .first { it["protocol"]!!.jsonPrimitive.content == "org-iso-mdoc" }
                val data = orgIsoMdoc["data"]!!.jsonObject
                val deviceRequest = data["deviceRequest"]!!.jsonPrimitive.content
                val encryptionInfo = data["encryptionInfo"]!!.jsonPrimitive.content
                requestData = deviceRequest to encryptionInfo
                Log.d(TAG, "parseRequest ok origin=$origin")
            } catch (e: Throwable) {
                Log.e(TAG, "parseRequest failed", e)
                error = e.message ?: "Could not parse the credential request"
            }
        }

        // Parse the request in parallel with authentication.
        androidx.compose.runtime.LaunchedEffect(Unit) { parseRequest() }

        // Go straight to biometric/PIN — no visible app UI before it.
        androidx.compose.runtime.LaunchedEffect(Unit) {
            delay(300)
            authenticateUser(
                activity = activity,
                onSuccess = { authenticated = true },
                onCancel = { activity.finishCancelled() },
                onError = { activity.finishWithFailure(it) },
            )
        }

        val ready = origin != null && requestData != null

        // Once authenticated and parsed, read the (auth-bound) mdoc and respond.
        androidx.compose.runtime.LaunchedEffect(authenticated, ready) {
            val resolvedOrigin = origin
            val resolvedRequest = requestData
            if (authenticated && resolvedOrigin != null && resolvedRequest != null) {
                val mdocBase64Url = try {
                    store.mdoc(credentialId)
                } catch (e: Throwable) {
                    Log.e(TAG, "mdoc read failed", e)
                    null
                }
                if (mdocBase64Url == null) {
                    activity.finishWithFailure("Credential could not be unlocked for sharing")
                    return@LaunchedEffect
                }
                buildAndRespond(activity, store, mdocBase64Url, resolvedOrigin, resolvedRequest)
            }
        }

        // If parsing failed, finish without showing anything.
        if (error != null) {
            androidx.compose.runtime.LaunchedEffect(Unit) { activity.finishWithFailure(error!!) }
        }
    }

    private fun describeClaims(claims: Map<String, Set<String>>): String =
        claims.entries.joinToString("\n") { (namespace, fields) ->
            "• ${namespace.split('.').last()}: ${fields.sorted().joinToString(", ")}"
        }

    private fun resolveOrigin(callingAppInfo: CallingAppInfo): String {
        Log.d(TAG, "resolveOrigin package=${callingAppInfo.packageName}")
        try {
            val si = callingAppInfo.signingInfoCompat
            fun fps(certs: List<android.content.pm.Signature>) = certs.map { cert ->
                java.security.MessageDigest.getInstance("SHA-256")
                    .digest(cert.toByteArray())
                    .joinToString(":") { "%02X".format(it) }
            }
            Log.d(TAG, "caller multipleSigners=${si.hasMultipleSigners} apkSigners=${fps(si.apkContentsSigners)} history=${fps(si.signingCertificateHistory)}")
        } catch (e: Throwable) {
            Log.d(TAG, "caller cert read failed: ${e.message}")
        }
        val origin = callingAppInfo.getOrigin(privilegedAllowList)
        Log.d(TAG, "resolveOrigin origin=$origin")
        return origin
            ?: throw SecurityException("Could not verify the origin of the requesting application")
    }

    private fun authenticateUser(
        activity: PresentationActivity,
        onSuccess: () -> Unit,
        onCancel: () -> Unit,
        onError: (String) -> Unit,
    ) {
        Log.d(TAG, "authenticateUser called")
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                Log.d(TAG, "authentication ok")
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                Log.d(TAG, "authentication error code=$errorCode msg=$errString")
                if (errorCode == BiometricPrompt.ERROR_USER_CANCELED || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                    onCancel()
                } else {
                    onError(errString.toString())
                }
            }

            override fun onAuthenticationFailed() {
                Log.d(TAG, "authentication failed (mismatch)")
            }
        })

        Log.d(TAG, "launching biometric prompt")
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Verify it's you")
                .setSubtitle("Authentication is required to share your academic credential")
                .setAllowedAuthenticators(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or
                        BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
                .build()
        )
        Log.d(TAG, "biometric prompt launched")
    }

    private fun buildAndRespond(
        activity: PresentationActivity,
        store: SecureStore,
        mdocBase64Url: String,
        origin: String,
        request: Pair<String, String>,
    ) {
        Log.d(TAG, "buildAndRespond called")
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = MdocResponseBuilder.build(
                    deviceRequestBase64Url = request.first,
                    encryptionInfoBase64Url = request.second,
                    origin = origin,
                    mdocBase64Url = mdocBase64Url,
                    devicePrivateKey = store.devicePrivateKey(),
                )
                Log.d(TAG, "build ok len=${response.length}")
                activity.sendResponse(response)
            } catch (e: Throwable) {
                Log.e(TAG, "build failed", e)
                if (e is UserNotAuthenticatedException) {
                    // The Keystore key requires a fresh biometric confirmation.
                    activity.finishWithFailure("Biometric authentication is required to share this credential")
                } else {
                    activity.finishWithFailure(e.message ?: "Could not build the credential response")
                }
            }
        }
    }

    private fun sendResponse(encryptedResponseBase64Url: String) {
        Log.d(TAG, "sendResponse len=${encryptedResponseBase64Url.length}")
        val json = buildJsonObject {
            put("protocol", "org-iso-mdoc")
            put("data", buildJsonObject {
                put("response", encryptedResponseBase64Url)
            })
        }.toString()
        val resultData = Intent()
        PendingIntentHandler.setGetCredentialResponse(resultData, GetCredentialResponse(DigitalCredential(json)))
        setResult(RESULT_OK, resultData)
        finish()
    }

    private fun finishCancelled() {
        Log.d(TAG, "finishCancelled")
        val resultData = Intent()
        PendingIntentHandler.setGetCredentialException(resultData, GetCredentialCancellationException())
        setResult(RESULT_OK, resultData)
        finish()
    }

    private fun finishWithFailure(message: String) {
        Log.d(TAG, "finishWithFailure: $message")
        val resultData = Intent()
        PendingIntentHandler.setGetCredentialException(resultData, GetCredentialUnknownException(message))
        setResult(RESULT_OK, resultData)
        finish()
    }
}

@Composable
private fun ConsentScreen(
    title: String,
    body: String,
    busy: Boolean,
    onApprove: (() -> Unit)?,
    onCancel: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.Start,
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        Text(body, style = MaterialTheme.typography.bodyLarge)
        Spacer(Modifier.height(32.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f), enabled = !busy) {
                Text("Cancel")
            }
            Button(
                onClick = { onApprove?.invoke() },
                modifier = Modifier.weight(1f),
                enabled = !busy && onApprove != null,
            ) {
                Text("Share")
            }
        }
    }
}

@Composable
private fun MissingCredentialScreen(onClose: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("No credential to share", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        Text("Add an academic credential to this wallet before verifying with a relying party.")
        Spacer(Modifier.height(32.dp))
        Button(onClick = onClose) { Text("Close") }
    }
}
