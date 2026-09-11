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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartcollege.transcript.wallet.data.WalletRepository

/**
 * Same-device issuance: the wallet was opened by an OpenID4VCI credential-offer
 * deeplink, so the offer is claimed immediately instead of asking the user to
 * scan a QR code on the same screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReceiveOfferScreen(
    repository: WalletRepository,
    offerUrl: String,
    onDone: () -> Unit,
    onCancel: () -> Unit,
) {
    var busy by remember { mutableStateOf(true) }
    var succeeded by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableStateOf(0) }
    val context = LocalContext.current

    LaunchedEffect(offerUrl, attempt) {
        busy = true
        error = null
        repository.claim(offerUrl)
            .onSuccess {
                repository.registerWithSystem(context)
                succeeded = true
            }
            .onFailure { error = it.message ?: "We could not add this credential." }
        busy = false
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Add to wallet") }) },
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
                    Text(
                        "Receiving your credential…",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Keep this screen open while we verify and store it on your device.",
                        style = MaterialTheme.typography.bodyMedium,
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

                else -> {
                    Text(
                        "We could not add the credential",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(10.dp))
                    Text(
                        error ?: "Something went wrong.",
                        style = MaterialTheme.typography.bodyMedium,
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
                        onClick = onCancel,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Text("Back to my wallet")
                    }
                }
            }
        }
    }
}
