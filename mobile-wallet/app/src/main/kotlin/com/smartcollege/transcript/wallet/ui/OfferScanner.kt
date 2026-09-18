package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import com.smartcollege.transcript.wallet.data.WalletRepository
import kotlinx.coroutines.launch

/**
 * Receive a credential by scanning (or, when unavailable, pasting) an
 * OpenID4VCI offer URL. The offer is sent to the issuer BFF (`/wallet/issuance`)
 * with the authenticated wallet access token and device-signed CWT.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OfferScanScreen(
    repository: WalletRepository,
    onDone: () -> Unit,
    onBack: () -> Unit,
    onScannerOpenChange: (Boolean) -> Unit = {},
) {
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val scanner = remember(context) {
        GmsBarcodeScanning.getClient(
            context,
            GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .enableAutoZoom()
                .build()
        )
    }

    // ML Kit's bundled scanner launches a separate Activity, which would pause
    // the wallet. Tell the host so it does not re-lock (and cancel this screen)
    // while scanning is in progress.
    DisposableEffect(Unit) {
        onDispose { onScannerOpenChange(false) }
    }

    fun claim(url: String) {
        if (url.isBlank()) return
        scope.launch {
            busy = true
            repository.claim(url)
                .onSuccess {
                    repository.registerWithSystem(context)
                    onDone()
                }
                .onFailure { message = it.message }
            busy = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Receive credential") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Text(
                "Scan the QR code your institution sent you to add the credential to this device.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = {
                    message = null
                    onScannerOpenChange(true)
                    scanner.startScan()
                        .addOnSuccessListener { barcode ->
                            onScannerOpenChange(false)
                            barcode.rawValue?.let { claim(it) }
                                ?: run { message = "That QR code does not contain a credential offer." }
                        }
                        .addOnFailureListener { error ->
                            onScannerOpenChange(false)
                            message = error.message ?: "Unable to start the camera."
                        }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Scan QR code") }
            message?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
