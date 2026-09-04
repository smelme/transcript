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
fun OfferScanScreen(repository: WalletRepository, onDone: () -> Unit, onBack: () -> Unit) {
    var manualUrl by remember { mutableStateOf("") }
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
                "Scan the offer QR code to claim your credential. You can also paste an offer URL.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = {
                    message = null
                    scanner.startScan()
                        .addOnSuccessListener { barcode ->
                            barcode.rawValue?.let { claim(it) }
                                ?: run { message = "The QR code did not contain an offer URL." }
                        }
                        .addOnFailureListener { error ->
                            message = error.message
                                ?: "Unable to start the QR scanner. Paste the offer URL instead."
                        }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Scan offer QR code") }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = manualUrl,
                onValueChange = { manualUrl = it },
                label = { Text("offer URL") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { claim(manualUrl) },
                enabled = !busy && manualUrl.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Claim credential") }
            message?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
