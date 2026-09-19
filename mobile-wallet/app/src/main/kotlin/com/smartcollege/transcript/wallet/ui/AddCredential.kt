package com.smartcollege.transcript.wallet.ui

import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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

/**
 * Add a credential from a link - the link an institution emailed, or the one the holder's own
 * device opened the wallet with.
 *
 * This is the counterpart to the reader: same claim, but reached by reading or pasting a link
 * rather than by pointing a camera at something. A link that is not an offer is named as such
 * before it is sent anywhere, which is a better answer than a claim failing with "invalid
 * credential offer".
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCredentialScreen(
    repository: WalletRepository,
    offerUrl: String?,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    // The link the wallet was opened with, if any: claimed on arrival, with no typing.
    var typed by remember { mutableStateOf("") }
    var pending by remember { mutableStateOf(offerUrl?.takeIf { it.isNotBlank() }) }
    var busy by remember { mutableStateOf(false) }
    var succeeded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    val context = LocalContext.current

    fun add(raw: String?) {
        when (val code = ScannedCode.of(raw)) {
            is ScannedCode.CredentialOffer -> {
                error = null
                pending = code.url
                attempt += 1
            }
            else -> error = "That is a link, not a credential offer."
        }
    }

    LaunchedEffect(pending, attempt) {
        val url = pending ?: return@LaunchedEffect
        busy = true
        error = null
        repository.claim(url)
            .onSuccess {
                repository.registerWithSystem(context)
                succeeded = true
            }
            .onFailure { error = it.message ?: "We could not add this credential." }
        busy = false
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

                succeeded -> {
                    Text(
                        "Credential added",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "It is now stored in your wallet and can be shared whenever you need it.",
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

                // A link the wallet was opened with: it has been tried, and it did not work.
                arrivedWithLink -> {
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
                        "Paste the link your institution sent you.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = typed,
                        onValueChange = {
                            typed = it
                            error = null
                        },
                        label = { Text("Credential link") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    error?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = { clipboardText(context)?.let { typed = it; error = null } },
                    ) { Text("Paste from clipboard") }
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { add(typed) },
                        enabled = typed.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Text("Add credential", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

/** The clipboard, read only when the holder asks for it by tapping Paste. */
private fun clipboardText(context: Context): String? {
    val manager = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return null
    val clip = manager.primaryClip?.takeIf { it.itemCount > 0 } ?: return null
    return clip.getItemAt(0).coerceToText(context)?.toString()?.trim()?.takeIf { it.isNotBlank() }
}
