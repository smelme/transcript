package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import com.smartcollege.transcript.wallet.data.ScannedCode
import com.smartcollege.transcript.wallet.data.WalletRepository
import kotlinx.coroutines.launch

/**
 * The reader, which is a camera and nothing else.
 *
 * Tapping Scan was the decision, so the camera opens on arrival: no page, no explanation, no second
 * tap. Whatever the code turns out to be, the wallet gets out of the way - a credential arrives and
 * the holder is back where they were, or a link is opened and another app takes over. Neither wants
 * a page of ours in between, so the outcome travels back with the holder and is said there.
 */
@Composable
fun ScanScreen(
    repository: WalletRepository,
    onFinished: (String?) -> Unit,
    onScannerOpenChange: (Boolean) -> Unit = {},
) {
    var busy by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scanner = remember(context) { scannerFor(context) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        scanner.read(onScannerOpenChange) { outcome ->
            when (outcome) {
                // Closing the camera means the holder changed their mind, and they are already
                // back where they started.
                is ScanOutcome.Cancelled -> onFinished(null)

                is ScanOutcome.Failed -> onFinished(outcome.message)

                is ScanOutcome.Code -> when (val scanned = ScannedCode.of(outcome.raw)) {
                    is ScannedCode.CredentialOffer -> {
                        busy = true
                        scope.launch {
                            repository.claim(scanned.url)
                                .onSuccess {
                                    repository.registerWithSystem(context)
                                    // The credential appearing is the confirmation.
                                    onFinished(null)
                                }
                                .onFailure {
                                    onFinished(it.message ?: "We could not add this credential.")
                                }
                            busy = false
                        }
                    }

                    // Someone else's code, and most likely a presentation request: it belongs to
                    // the system's credential manager, which will ask this wallet only if it is
                    // one of the providers offered a choice. Opening it is what the camera app
                    // does with it, and the wallet steps back rather than sitting in front of it.
                    is ScannedCode.FidoLink -> onFinished(openExternally(context, scanned.url))

                    is ScannedCode.WebLink -> onFinished(openExternally(context, scanned.url))

                    is ScannedCode.Unknown ->
                        onFinished("That QR code does not contain a credential offer.")
                }
            }
        }
    }

    DisposableEffect(Unit) { onDispose { onScannerOpenChange(false) } }

    // The camera covers this; all that is ever visible is the moment a claim takes.
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        if (busy) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text("Adding your credential…", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}
