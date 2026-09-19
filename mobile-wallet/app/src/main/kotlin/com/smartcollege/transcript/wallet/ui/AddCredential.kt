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
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartcollege.transcript.wallet.data.ScannedCode
import com.smartcollege.transcript.wallet.data.WalletRepository
import kotlinx.coroutines.launch

/**
 * Add a credential: the guided way in, for a holder who has been told to scan something.
 *
 * It says what to do, offers the one button that does it, and then reports what happened - by name,
 * since "your credential from Auckland is added" is worth more than "success". The scanning itself
 * is the same camera the reader uses; the difference is only that here it is an instruction being
 * carried out, so the screen stays and explains.
 *
 * A link the wallet was opened with is claimed on arrival without any of that: the holder has
 * already followed the instruction by tapping it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCredentialScreen(
    repository: WalletRepository,
    offerUrl: String?,
    onDone: () -> Unit,
    onBack: () -> Unit,
    onScannerOpenChange: (Boolean) -> Unit = {},
) {
    var busy by remember { mutableStateOf(false) }
    var added by remember { mutableStateOf(false) }
    var addedFrom by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    val context = LocalContext.current
    val scanner = remember(context) { scannerFor(context) }
    val scope = rememberCoroutineScope()

    fun claim(url: String) {
        scope.launch {
            busy = true
            error = null
            repository.claim(url)
                .onSuccess { stored ->
                    repository.registerWithSystem(context)
                    val institution = stored.summary.institution
                    addedFrom = institution.takeIf { it.isNotBlank() }?.let { brandOf(it).title }
                    added = true
                }
                .onFailure { error = it.message ?: "We could not add this credential." }
            busy = false
        }
    }

    fun scan() {
        error = null
        scanner.read(onScannerOpenChange) { outcome ->
            when (outcome) {
                is ScanOutcome.Code -> when (val scanned = ScannedCode.of(outcome.raw)) {
                    is ScannedCode.CredentialOffer -> claim(scanned.url)

                    // Worth naming: the holder was told to scan an offer, so a link or something
                    // else entirely is a wrong-turn rather than a failed claim.
                    is ScannedCode.FidoLink, is ScannedCode.WebLink ->
                        error = "That QR code is a link, not a credential offer. Scan the code " +
                            "your institution sent you."

                    is ScannedCode.Unknown ->
                        error = "That QR code does not contain a credential offer."
                }

                // Closing the camera leaves the instruction where it was, ready to try again.
                is ScanOutcome.Cancelled -> Unit

                is ScanOutcome.Failed -> error = outcome.message
            }
        }
    }

    // A link the wallet was opened with needs no scanning and no typing.
    LaunchedEffect(offerUrl, attempt) {
        if (!offerUrl.isNullOrBlank()) claim(offerUrl)
    }

    val arrivedWithLink = !offerUrl.isNullOrBlank()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add credential") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            when {
                busy -> {
                    CircularProgressIndicator()
                    Spacer(Modifier.height(20.dp))
                    Text("Receiving your credential…", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Keep this screen open while we verify and store it on your device.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    )
                }

                added -> {
                    Text(
                        addedFrom?.let { "Your credential from $it is successfully added" }
                            ?: "Your credential is successfully added",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "It is stored on this device and can be shared whenever you need it.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                    )
                    Spacer(Modifier.height(28.dp))
                    Button(
                        onClick = onDone,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Text("View my credentials", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }

                // A link the wallet was opened with has been tried, and it did not work: there is
                // no instruction left to return to.
                arrivedWithLink && error != null -> {
                    Text(
                        "We could not add the credential",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        error ?: "Something went wrong.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(24.dp))
                    Button(
                        onClick = { attempt += 1 },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Text("Try again", fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(10.dp))
                    OutlinedButton(
                        onClick = onBack,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Text("Back to my wallet")
                    }
                }

                else -> {
                    Text(
                        "Add your credential",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Scan the QR code from your institution and your credential is added to " +
                            "this wallet.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.75f),
                    )
                    error?.let {
                        Spacer(Modifier.height(16.dp))
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Spacer(Modifier.height(28.dp))
                    Button(
                        onClick = { scan() },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Text("Scan QR code", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}
