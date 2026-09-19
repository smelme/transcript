package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.smartcollege.transcript.wallet.data.ScannedCode
import com.smartcollege.transcript.wallet.data.WalletRepository
import kotlinx.coroutines.launch

/**
 * The reader. It reads a code, decides what the code is, and acts on it.
 *
 * There is no page here to read first, because there is nothing to explain: a holder who has been
 * handed a code has already decided to use it. Whatever the code turns out to be, the outcome is
 * either a credential arriving (the list), another app entirely (a FIDO code, which belongs to the
 * system's credential manager), or one sentence saying why nothing happened - and the camera, back.
 *
 * The camera opens on arrival, since the tap that got here was the decision.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanScreen(
    repository: WalletRepository,
    onClaimed: () -> Unit,
    onCancel: () -> Unit,
    onScannerOpenChange: (Boolean) -> Unit = {},
) {
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var pendingLink by remember { mutableStateOf<String?>(null) }
    var reads by remember { mutableStateOf(0) }
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
        scope.launch {
            busy = true
            repository.claim(url)
                .onSuccess {
                    repository.registerWithSystem(context)
                    onClaimed()
                }
                .onFailure { message = it.message ?: "We could not add this credential." }
            busy = false
        }
    }

    fun read() {
        message = null
        pendingLink = null
        // The scanner runs in its own Activity, which pauses the wallet. Tell the host so it does
        // not treat that as the holder leaving, and re-lock over the camera.
        onScannerOpenChange(true)
        scanner.startScan()
            .addOnSuccessListener { barcode ->
                onScannerOpenChange(false)
                when (val scanned = ScannedCode.of(barcode.rawValue)) {
                    is ScannedCode.CredentialOffer -> claim(scanned.url)

                    // Someone else's code, and most likely a presentation request: it belongs to
                    // the system's credential manager, which will ask this wallet only if it is
                    // one of the providers offered a choice. Opening it is what the camera app
                    // does with it.
                    is ScannedCode.FidoLink -> message = openExternally(context, scanned.url)

                    is ScannedCode.WebLink -> {
                        pendingLink = scanned.url
                        message = "That QR code is a link rather than a credential offer."
                    }

                    is ScannedCode.Unknown ->
                        message = "That QR code does not contain a credential offer."
                }
            }
            .addOnFailureListener { error ->
                onScannerOpenChange(false)
                // Closing the camera is not a failure worth reporting; a camera that will not
                // open is.
                val text = error.message.orEmpty()
                if (!text.contains("cancel", ignoreCase = true)) {
                    message = text.ifBlank { "Unable to open the camera." }
                }
            }
    }

    LaunchedEffect(reads) { read() }
    DisposableEffect(Unit) { onDispose { onScannerOpenChange(false) } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan") },
                navigationIcon = { TextButton(onClick = onCancel) { Text("Cancel") } },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (busy) {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text("Adding your credential…", style = MaterialTheme.typography.titleMedium)
            } else {
                message?.let { text ->
                    Text(
                        text,
                        style = MaterialTheme.typography.bodyLarge,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(16.dp))
                }
                pendingLink?.let { link ->
                    TextButton(
                        onClick = {
                            message = openExternally(context, link)
                            pendingLink = null
                        },
                    ) { Text("Open link anyway") }
                    Spacer(Modifier.height(8.dp))
                }
                Button(
                    onClick = { reads += 1 },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (message == null && pendingLink == null) "Open the camera" else "Scan again")
                }
            }
        }
    }
}
