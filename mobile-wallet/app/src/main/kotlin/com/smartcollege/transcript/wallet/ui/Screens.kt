package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.smartcollege.transcript.wallet.data.CredentialSummary
import com.smartcollege.transcript.wallet.data.WalletRepository
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(repository: WalletRepository, onSignedIn: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Sign in to your wallet", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = otp,
            onValueChange = { otp = it },
            label = { Text("One-time code") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = {
                scope.launch {
                    busy = true
                    repository.requestOtp(email)
                        .onSuccess { devOtp ->
                            message = devOtp?.let { "Dev code: $it" } ?: "Code sent to $email"
                        }
                        .onFailure { message = it.message }
                    busy = false
                }
            },
            enabled = !busy && email.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Request code") }
        Spacer(Modifier.height(8.dp))
        Button(
            onClick = {
                scope.launch {
                    busy = true
                    repository.signIn(email, otp)
                        .onSuccess { onSignedIn() }
                        .onFailure { message = it.message }
                    busy = false
                }
            },
            enabled = !busy && email.isNotBlank() && otp.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign in") }
        message?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CredentialListScreen(
    repository: WalletRepository,
    onScan: () -> Unit,
    onOpen: (String) -> Unit,
    onSignOut: () -> Unit,
) {
    val ids = remember { repository.credentialIds() }
    val summaries = remember(ids) { ids.associateWith { repository.credentialSummary(it) } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Quals") },
                actions = {
                    TextButton(onClick = onScan) { Text("Scan") }
                    TextButton(onClick = onSignOut) { Text("Sign out") }
                },
            )
        },
    ) { padding ->
        if (ids.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("No credentials yet")
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onScan) { Text("Scan offer QR") }
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(padding)) {
                items(ids) { id ->
                    CertificateCard(
                        summary = summaries[id],
                        onClick = { onOpen(id) },
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun CertificateCard(summary: CredentialSummary?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val personName = summary?.fullName?.takeIf { it.isNotBlank() } ?: "Issued credential"
    val institution = summary?.institution?.takeIf { it.isNotBlank() } ?: "Smart Academy"
    val degreeLevel = summary?.degreeLevel?.takeIf { it.isNotBlank() } ?: "Degree level not recorded"
    val graduationDate = summary?.graduationDate?.takeIf { it.isNotBlank() } ?: "Graduation date not recorded"

    Card(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
    ) {
        Column(
            modifier = Modifier
                .background(
                    Brush.linearGradient(
                        colors = listOf(Color(0xFF1B9C5B), Color(0xFF0E6B3D)),
                    )
                )
                .padding(20.dp),
        ) {
            Text(
                "ACADEMIC CERTIFICATE",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xFFD3F5E4),
            )
            Spacer(Modifier.height(14.dp))
            Text(personName, style = MaterialTheme.typography.headlineSmall, color = Color.White)
            Spacer(Modifier.height(8.dp))
            Text(institution, style = MaterialTheme.typography.titleMedium, color = Color(0xFFE2F7EC))
            Spacer(Modifier.height(16.dp))
            Text(degreeLevel, style = MaterialTheme.typography.bodyLarge, color = Color.White)
            Text(
                "Graduation: $graduationDate",
                style = MaterialTheme.typography.bodyMedium,
                color = Color(0xFFE2F7EC),
            )
            Spacer(Modifier.height(14.dp))
            Text(
                "Tap to view credential details",
                style = MaterialTheme.typography.labelMedium,
                color = Color(0xFFD3F5E4),
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CredentialDetailScreen(repository: WalletRepository, credentialId: String, onBack: () -> Unit) {
    val summary = remember(credentialId) { repository.credentialSummary(credentialId) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Credential") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Text("Certificate details", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(16.dp))
            DetailField("Name", summary?.fullName)
            DetailField("Institution", summary?.institution)
            DetailField("Degree level", summary?.degreeLevel)
            DetailField("Graduation date", summary?.graduationDate)
            deleteError?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(12.dp))
            }
            Button(onClick = { confirmDelete = true }, enabled = !deleting) {
                Text("Delete credential")
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { if (!deleting) confirmDelete = false },
            title = { Text("Delete credential?") },
            text = { Text("This permanently removes this credential and its stored claims from this wallet.") },
            confirmButton = {
                Button(
                    onClick = {
                        deleting = true
                        scope.launch {
                            repository.deleteCredential(credentialId)
                                .onSuccess {
                                    repository.registerWithSystem(context)
                                    onBack()
                                }
                                .onFailure {
                                    deleteError = it.message ?: "Could not delete credential"
                                    deleting = false
                                    confirmDelete = false
                                }
                        }
                    },
                    enabled = !deleting,
                ) { Text(if (deleting) "Deleting" else "Delete") }
            },
            dismissButton = {
                TextButton(onClick = { confirmDelete = false }, enabled = !deleting) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun DetailField(label: String, value: String?) {
    Text(label, style = MaterialTheme.typography.labelMedium)
    Text(value?.takeIf { it.isNotBlank() } ?: "Not recorded", style = MaterialTheme.typography.bodyLarge)
    Spacer(Modifier.height(12.dp))
}
