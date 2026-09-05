package com.smartcollege.transcript.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartcollege.transcript.wallet.data.CredentialSummary
import com.smartcollege.transcript.wallet.data.WalletRepository
import kotlinx.coroutines.launch

@Composable
fun SignInScreen(repository: WalletRepository, onSignedIn: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var otpSent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val requestCode: () -> Unit = {
        scope.launch {
            busy = true
            repository.requestOtp(email)
                .onSuccess { devOtp ->
                    otpSent = true
                    message = devOtp?.let { "Dev code: $it" } ?: "Code sent to $email"
                }
                .onFailure { message = it.message }
            busy = false
        }
    }

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        cursorColor = QualsGold,
        focusedBorderColor = QualsGold,
        unfocusedBorderColor = Color.White.copy(alpha = 0.45f),
        focusedLabelColor = QualsGold,
        unfocusedLabelColor = Color.White.copy(alpha = 0.6f),
        focusedContainerColor = Color.Transparent,
        unfocusedContainerColor = Color.Transparent,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .padding(horizontal = 28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        QualsLogoMark(Modifier.fillMaxWidth(0.5f))
        Spacer(Modifier.height(24.dp))
        Text(
            "Sign in to access your credentials",
            style = MaterialTheme.typography.bodyLarge,
            color = Color.White.copy(alpha = 0.75f),
        )
        Spacer(Modifier.height(28.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("EMAIL ADDRESS") },
            singleLine = true,
            colors = fieldColors,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))

        if (otpSent) {
            OutlinedTextField(
                value = otp,
                onValueChange = { otp = it },
                label = { Text("ONE-TIME CODE") },
                singleLine = true,
                colors = fieldColors,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(4.dp))
            TextButton(
                onClick = requestCode,
                enabled = !busy && email.isNotBlank(),
            ) {
                Text("Resend code", color = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(12.dp))
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
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = QualsGold, contentColor = Color.Black),
            ) {
                Text("Sign in", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        } else {
            Button(
                onClick = requestCode,
                enabled = !busy && email.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = QualsGold, contentColor = Color.Black),
            ) {
                Text("Get a one-time code", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        }

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
        Column(Modifier.fillMaxSize().padding(padding)) {
            Text(
                "YOUR CREDENTIALS",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            )
            if (ids.isEmpty()) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("No credentials yet")
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = onScan) { Text("Scan offer QR") }
                    }
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(ids) { id ->
                        CredentialCard(
                            credentialId = id,
                            summary = summaries[id],
                            onClick = { onOpen(id) },
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                        )
                    }
                }
            }
        }
    }
}

private val MonthNames = listOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)

private val InstitutionColors = listOf(
    Color(0xFF1D3557), // navy
    Color(0xFF1B5E20), // green
    Color(0xFF6A1B2A), // maroon
    Color(0xFF4A148C), // purple
    Color(0xFF006064), // teal
    Color(0xFF4E342E), // brown
)

@Composable
private fun CredentialCard(
    credentialId: String,
    summary: CredentialSummary?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val institution = summary?.institution?.takeIf { it.isNotBlank() } ?: "Smart Academy"
    val title = summary?.degreeLevel?.takeIf { it.isNotBlank() } ?: "Credential"
    val issuedDate = formatDate(summary?.graduationDate)
    val cardColor = institutionColor(institution)

    Card(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        colors = CardDefaults.cardColors(containerColor = cardColor),
    ) {
        Column(Modifier.padding(20.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    institution.uppercase(),
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White.copy(alpha = 0.9f),
                    modifier = Modifier.weight(1f),
                )
                VerifiedPill()
            }
            Spacer(Modifier.height(10.dp))
            Text(
                title,
                style = MaterialTheme.typography.titleLarge,
                color = Color.White,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                credentialId,
                style = MaterialTheme.typography.bodyMedium,
                color = Color.White.copy(alpha = 0.75f),
            )
            if (issuedDate != null) {
                Text(
                    "Issued $issuedDate",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f),
                )
            }
        }
    }
}

@Composable
private fun VerifiedPill() {
    Box(
        modifier = Modifier
            .background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(999.dp))
            .padding(horizontal = 12.dp, vertical = 5.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("\u2713", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.size(4.dp))
            Text(
                "VERIFIED",
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
        }
    }
}

private fun institutionColor(institution: String): Color {
    val hash = institution.hashCode().let { if (it == Int.MIN_VALUE) 0 else kotlin.math.abs(it) }
    return InstitutionColors[hash % InstitutionColors.size]
}

private fun formatDate(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val match = Regex("^(\\d{4})-(\\d{2})").find(raw.trim())
    if (match != null) {
        val year = match.groupValues[1]
        val month = match.groupValues[2].toIntOrNull()?.takeIf { it in 1..12 }
        return if (month != null) "${MonthNames[month - 1]} $year" else year
    }
    return raw.trim()
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

    val personName = summary?.fullName?.takeIf { it.isNotBlank() } ?: "Credential holder"
    val institution = summary?.institution?.takeIf { it.isNotBlank() } ?: "Smart Academy"
    val title = summary?.degreeLevel?.takeIf { it.isNotBlank() } ?: "Credential"
    val issuedDate = formatDate(summary?.graduationDate)
    val cardColor = institutionColor(institution)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Credential") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
                colors = CardDefaults.cardColors(containerColor = cardColor),
            ) {
                Column(Modifier.padding(22.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Text(
                            institution.uppercase(),
                            style = MaterialTheme.typography.labelMedium,
                            color = Color.White.copy(alpha = 0.9f),
                            modifier = Modifier.weight(1f),
                        )
                        VerifiedPill()
                    }
                    Spacer(Modifier.height(16.dp))
                    Text(
                        personName,
                        style = MaterialTheme.typography.headlineMedium,
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        title,
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White.copy(alpha = 0.9f),
                    )
                    Spacer(Modifier.height(18.dp))
                    Text(
                        credentialId,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.75f),
                    )
                    if (issuedDate != null) {
                        Text(
                            "Issued $issuedDate",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.7f),
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
            Text(
                "DETAILS",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                modifier = Modifier.padding(bottom = 8.dp),
            )
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            ) {
                Column(Modifier.padding(vertical = 6.dp)) {
                    DetailRow("Name", summary?.fullName)
                    DetailRow("Institution", summary?.institution)
                    DetailRow("Degree level", summary?.degreeLevel)
                    DetailRow("Graduation date", summary?.graduationDate)
                    DetailRow("Credential ID", credentialId)
                }
            }

            deleteError?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(24.dp))
            Button(
                onClick = { confirmDelete = true },
                enabled = !deleting,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                ),
            ) {
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
private fun DetailRow(label: String, value: String?) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(
            value?.takeIf { it.isNotBlank() } ?: "Not recorded",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.End,
        )
    }
}
