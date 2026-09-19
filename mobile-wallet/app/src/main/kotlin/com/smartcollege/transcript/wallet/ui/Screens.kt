package com.smartcollege.transcript.wallet.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.smartcollege.transcript.wallet.data.AcademicNamespaces
import com.smartcollege.transcript.wallet.data.Claim
import com.smartcollege.transcript.wallet.data.ClaimCatalogue
import com.smartcollege.transcript.wallet.data.ClaimGroup
import com.smartcollege.transcript.wallet.data.CredentialSummary
import com.smartcollege.transcript.wallet.data.ShareActivity
import com.smartcollege.transcript.wallet.data.ShareActivityCodec
import com.smartcollege.transcript.wallet.data.WalletRepository
import kotlinx.coroutines.delay
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

    val cardBg = Color(0xFF16191C)
    val fieldBg = Color(0xFF1E2226)
    val olive = Color(0xFF3A3A2E)
    val mutedText = Color(0xFF9CA3AD)

    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = Color.White,
        unfocusedTextColor = Color.White,
        cursorColor = QualsGold,
        focusedBorderColor = Color.Transparent,
        unfocusedBorderColor = Color.Transparent,
        focusedContainerColor = fieldBg,
        unfocusedContainerColor = fieldBg,
        focusedLabelColor = QualsGold,
        unfocusedLabelColor = Color.White.copy(alpha = 0.55f),
        focusedLeadingIconColor = QualsGold,
        unfocusedLeadingIconColor = QualsGold,
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        QualsLogoMark(Modifier.width(120.dp))
        Spacer(Modifier.height(12.dp))
        Text(
            "QUALS",
            color = Color.White,
            fontFamily = FontFamily.Serif,
            fontWeight = FontWeight.Bold,
            fontSize = 30.sp,
            letterSpacing = 8.sp,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Your credentials, verified",
            color = mutedText,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(28.dp))

        // Sign-in card
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(24.dp))
                .background(cardBg)
                .padding(22.dp),
        ) {
            Text(
                "Sign in",
                color = Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 22.sp,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "Enter your email to receive a one-time code",
                color = mutedText,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(18.dp))

            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email address") },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Filled.Email,
                        contentDescription = null,
                        tint = QualsGold,
                    )
                },
                singleLine = true,
                shape = RoundedCornerShape(14.dp),
                colors = fieldColors,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(14.dp))

            if (otpSent) {
                OutlinedTextField(
                    value = otp,
                    onValueChange = { otp = it },
                    label = { Text("One-time code") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    colors = fieldColors,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(6.dp))
                TextButton(
                    onClick = requestCode,
                    enabled = !busy && email.isNotBlank(),
                ) {
                    Text("Resend code", color = QualsGold)
                }
                Spacer(Modifier.height(10.dp))
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
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = olive,
                        contentColor = QualsGold,
                        disabledContainerColor = olive,
                        disabledContentColor = QualsGold.copy(alpha = 0.4f),
                    ),
                ) {
                    Text("Sign in", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            } else {
                Button(
                    onClick = requestCode,
                    enabled = !busy && email.isNotBlank(),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = olive,
                        contentColor = QualsGold,
                        disabledContainerColor = olive,
                        disabledContentColor = QualsGold.copy(alpha = 0.4f),
                    ),
                ) {
                    Text("Get a one-time code", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }

            message?.let {
                Spacer(Modifier.height(12.dp))
                Text(it, color = QualsGold, fontSize = 13.sp)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CredentialListScreen(
    repository: WalletRepository,
    onScan: () -> Unit,
    onAdd: () -> Unit,
    onOpen: (String) -> Unit,
    onSignOut: () -> Unit,
    message: String? = null,
    onMessageShown: () -> Unit = {},
) {
    val ids = remember { repository.credentialIds() }
    val summaries = remember(ids) { ids.associateWith { repository.credentialSummary(it) } }
    // Who is signed in, so the panel can say it and offer the way out. The wallet knows the
    // email; the holder's name comes from their own credential, which is the name a registrar
    // would recognise.
    val email = remember { repository.signedInEmail() }
    val holderName = remember(summaries) {
        summaries.values.mapNotNull { it?.fullName?.takeIf { name -> name.isNotBlank() } }.firstOrNull()
    }
    // What the reader had to say travels back with the holder and is said here, rather than on a
    // page of its own that they would then have to dismiss.
    val snackbarHostState = remember { SnackbarHostState() }
    LaunchedEffect(message) {
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message)
            onMessageShown()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Quals") },
                actions = {
                    TextButton(onClick = onAdd) { Text("Add") }
                    TextButton(onClick = onScan) { Text("Scan") }
                },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            AccountPanel(
                name = holderName
                    ?: email?.substringBefore('@')?.takeIf { it.isNotBlank() }
                    ?: "Signed in",
                email = email,
                credentialCount = ids.size,
                onSignOut = onSignOut,
            )
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
                        Button(onClick = onScan) { Text("Scan a QR code") }
                        Spacer(Modifier.height(8.dp))
                        OutlinedButton(onClick = onAdd) { Text("Add credential from a link") }
                    }
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    itemsIndexed(ids) { index, id ->
                        CredentialCard(
                            credentialId = id,
                            summary = summaries[id],
                            appearAfterMillis = if (index < 8) index * 45 else -1,
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

/**
 * Who is signed in, folded away until it is asked for.
 *
 * The account is not what a holder opens the wallet for, so it is a line - monogram, name, and the
 * way in - that opens to show the address it belongs to, what the wallet holds, and the way out.
 * Signing out belongs here, with the account it ends, rather than in the title bar.
 */
@Composable
private fun AccountPanel(
    name: String,
    email: String?,
    credentialCount: Int,
    onSignOut: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }

    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .clickable { expanded = !expanded }
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(40.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    initialsOf(name).ifBlank { "ID" },
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Spacer(Modifier.width(12.dp))
            Text(
                name,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
            Text(
                if (expanded) "Less" else "Account",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        AnimatedVisibility(visible = expanded) {
            Column {
                Spacer(Modifier.height(12.dp))
                if (!email.isNullOrBlank()) {
                    Text(
                        "Signed in as $email",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(4.dp))
                }
                Text(
                    when (credentialCount) {
                        0 -> "No credentials in this wallet yet"
                        1 -> "1 credential in this wallet"
                        else -> "$credentialCount credentials in this wallet"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(4.dp))
                TextButton(onClick = onSignOut, modifier = Modifier.align(Alignment.End)) {
                    Text("Sign out")
                }
            }
        }
    }
}

@Composable
private fun CredentialCard(
    credentialId: String,
    summary: CredentialSummary?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    appearAfterMillis: Int = 0,
) {
    val institution = summary?.institution?.takeIf { it.isNotBlank() } ?: "Smart Academy"
    val brand = brandOf(institution)
    // Cards arrive in order rather than all at once, which is what makes the list feel like a
    // wallet holding documents instead of rows appearing.
    //
    // Only the first screenful is staggered: a card further down is composed when it is scrolled
    // to, and animating it there would replay the entrance every time it came back into view.
    var appeared by remember { mutableStateOf(appearAfterMillis < 0) }
    LaunchedEffect(Unit) {
        delay(appearAfterMillis.coerceAtLeast(0).toLong())
        appeared = true
    }
    val entrance by animateFloatAsState(
        targetValue = if (appeared) 1f else 0f,
        animationSpec = tween(durationMillis = 260),
        label = "cardEntrance",
    )
    // Pressing a card is the one interaction this wallet is built on, so the card answers it: it
    // scales under the finger instead of rippling, which is what a physical card would do.
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.975f else 1f,
        animationSpec = tween(durationMillis = 110),
        label = "cardPress",
    )

    CredentialFace(
        brand = brand,
        personName = summary?.fullName?.takeIf { it.isNotBlank() } ?: "Credential holder",
        subtitle = credentialSubtitle(summary),
        credentialId = credentialId,
        issuedDate = formatDate(summary?.issueDate),
        compact = true,
        modifier = modifier
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
                alpha = entrance
                translationY = (1f - entrance) * 24.dp.toPx()
            }
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            ),
    )
}

/**
 * What the credential is for, in one line: the study a transcript holds, or the award a
 * qualification carries. A combined credential holds both, so it says both.
 */
private fun credentialSubtitle(summary: CredentialSummary?): String? {
    val kind = summary?.kind ?: AcademicNamespaces.KIND_UNKNOWN
    val holdsStudy =
        kind == AcademicNamespaces.KIND_TRANSCRIPT || kind == AcademicNamespaces.KIND_BOTH
    val parts = if (holdsStudy) {
        listOfNotNull(
            summary?.programmeTitle?.takeIf { it.isNotBlank() }
                ?: summary?.awardTitle?.takeIf { it.isNotBlank() },
            summary?.courseCount?.takeIf { it > 0 }?.let { "$it courses" },
            summary?.totalCredits?.takeIf { it > 0 }?.let { "$it credits" },
        )
    } else {
        listOfNotNull(
            summary?.degreeLevel?.takeIf { it.isNotBlank() },
            summary?.fieldOfStudy?.takeIf { it.isNotBlank() },
        )
    }
    return parts.joinToString(" · ").takeIf { it.isNotBlank() }
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
fun CredentialDetailScreen(
    repository: WalletRepository,
    credentialId: String,
    onBack: () -> Unit,
    onShare: () -> Unit,
    onActivity: () -> Unit,
) {
    val summary = remember(credentialId) { repository.credentialSummary(credentialId) }
    // The whole document, not the subset the card happens to draw. Read once: it cannot change
    // while the screen is open.
    val claimGroups = remember(credentialId) { repository.credentialClaims(credentialId) }
    // How many times this credential has been shared, so the way to the record of it can say so.
    val activityCount = remember(credentialId) { repository.activityCount(credentialId) }
    var menuOpen by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var deleteError by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val personName = summary?.fullName?.takeIf { it.isNotBlank() } ?: "Credential holder"
    val institution = summary?.institution?.takeIf { it.isNotBlank() } ?: "Smart Academy"
    val kind = summary?.kind ?: AcademicNamespaces.KIND_UNKNOWN
    val isTranscript = kind == AcademicNamespaces.KIND_TRANSCRIPT
    val isCombined = kind == AcademicNamespaces.KIND_BOTH
    val title = if (isTranscript || isCombined) {
        listOfNotNull(
            summary?.programmeTitle?.takeIf { it.isNotBlank() }
                ?: summary?.awardTitle?.takeIf { it.isNotBlank() },
            summary?.courseCount?.takeIf { it > 0 }?.let { "$it courses" },
            summary?.totalCredits?.takeIf { it > 0 }?.let { "$it credits" },
        ).joinToString(" · ")
    } else {
        listOfNotNull(
            summary?.degreeLevel?.takeIf { it.isNotBlank() },
            summary?.fieldOfStudy?.takeIf { it.isNotBlank() },
        ).joinToString(" · ")
    }
    val issuedDate = formatDate(summary?.issueDate)
    val brand = brandOf(institution)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Credential") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
                actions = {
                    // Removing a credential is destructive and rare, so it sits behind an overflow
                    // rather than next to the action a holder actually came here to take.
                    Box {
                        TextButton(onClick = { menuOpen = true }) { Text("More") }
                        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                            // The record of sharing is also here, next to the other thing a holder
                            // does to a credential rather than to the document itself.
                            if (activityCount > 0) {
                                DropdownMenuItem(
                                    text = { Text("Sharing activity") },
                                    onClick = {
                                        menuOpen = false
                                        onActivity()
                                    },
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("Delete credential") },
                                onClick = {
                                    menuOpen = false
                                    confirmDelete = true
                                },
                            )
                        }
                    }
                },
            )
        },
        // The one action worth reaching for stays on screen, rather than sitting at the end of a
        // long scroll with a destructive button stacked against it.
        bottomBar = {
            Column(
                Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                Button(
                    onClick = onShare,
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text("Share credential", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            // A failed delete is reported at the top, where the menu that triggers it lives and
            // where it can be seen without scrolling.
            deleteError?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(12.dp))
            }
            CredentialFace(
                brand = brand,
                personName = personName,
                subtitle = title.takeIf { it.isNotBlank() },
                credentialId = credentialId,
                issuedDate = issuedDate,
                compact = false,
            )
            // The card shows the reference the way a printed one does; the whole of it stays on the
            // screen for anyone who has to quote it.
            Spacer(Modifier.height(6.dp))
            Text(
                "Credential ID $credentialId",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.55f),
            )

            // What this credential has been used to disclose - and only when there is something to
            // show. An entry point that leads to "nothing here" is worse than no entry point.
            if (activityCount > 0) {
                Spacer(Modifier.height(16.dp))
                ActivityRow(activityCount, onActivity)
            }

            // The document itself, block by block: each says what it is about and opens when it is
            // asked for, so a credential carrying a dozen courses is still one screen to read.
            Spacer(Modifier.height(20.dp))
            if (claimGroups.isNotEmpty()) {
                for (group in claimGroups) {
                    ClaimSection(group)
                    Spacer(Modifier.height(8.dp))
                }
            } else {
                // The document is briefly unreadable while the device is locked, so the screen
                // falls back to the summary the wallet stored when the credential arrived.
                Spacer(Modifier.height(24.dp))
                SectionLabel("Details")
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                ) {
                    Column(Modifier.padding(vertical = 6.dp)) {
                        DetailRow("Name", summary?.fullName)
                        DetailRow("Institution", summary?.institution)
                        DetailRow("Programme", summary?.programmeTitle)
                        DetailRow("Award", summary?.awardTitle)
                        DetailRow("Issued", issuedDate)
                        if (isCombined || isTranscript) {
                            DetailRow("Graduation date", summary?.graduationDate)
                            DetailRow("Courses", summary?.courseCount?.takeIf { it > 0 }?.toString())
                            DetailRow("Total credits", summary?.totalCredits?.takeIf { it > 0 }?.toString())
                            DetailRow("Status", summary?.completionStatus)
                        } else {
                            DetailRow("Degree level", summary?.degreeLevel)
                            DetailRow("Field of study", summary?.fieldOfStudy)
                            DetailRow("Graduation date", summary?.graduationDate)
                        }
                        DetailRow("Credential ID", credentialId)
                    }
                }
            }

            Spacer(Modifier.height(24.dp))
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
private fun SectionLabel(title: String) {
    Text(
        title.uppercase(),
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
        modifier = Modifier.padding(bottom = 8.dp),
    )
}

/**
 * One claim: what it is on the left, what it says on the right, and - where the issuer recorded
 * it - the qualifying detail underneath rather than buried in the value.
 */
@Composable
private fun ClaimRow(claim: Claim) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                claim.label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
            claim.detail?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(
            claim.value,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.End,
            modifier = Modifier.padding(start = 12.dp),
        )
    }
}

/** How many courses are listed before the rest are asked for. */
private const val CoursesShownAtOnce = 3

/**
 * The way into the record of what this credential has disclosed.
 *
 * It is deliberately not a card. Dressed as one it read as another document to open, so it is a
 * quiet strip on the page instead: the credential is the only thing here that looks like a
 * document, which is what makes the credential recognisable.
 */
@Composable
private fun ActivityRow(count: Int, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
            .clickable { onOpen() }
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "Sharing activity",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                if (count == 1) {
                    "Shared once from this credential"
                } else {
                    "Shared $count times from this credential"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
            )
        }
        Text(
            "View",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

/**
 * One block of the document, saying what it is about until it is opened.
 *
 * A credential holds more than a holder reads at once - a course list alone can run to a dozen rows
 * - so each block collapses to a headline and opens when asked. Everything is still there, one tap
 * away, rather than several screens of rows to scroll past to reach the block that was wanted.
 */
@Composable
private fun ClaimSection(group: ClaimGroup) {
    var expanded by remember(group.id) { mutableStateOf(false) }
    var showAll by remember(group.id) { mutableStateOf(false) }
    // Courses are the one block that can be arbitrarily long, so they open a few rows at a time.
    val limit = if (group.id == ClaimCatalogue.SECTION_COURSES) CoursesShownAtOnce else Int.MAX_VALUE
    val shown = if (showAll) group.claims else group.claims.take(limit)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { expanded = !expanded }
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        group.title,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    // The headline is why a collapsed block is still worth reading.
                    if (!expanded) {
                        ClaimCatalogue.headlineFor(group)?.let {
                            Text(
                                it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                    }
                }
                Text(
                    if (expanded) "Hide" else "Show",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            AnimatedVisibility(visible = expanded) {
                Column {
                    for (claim in shown) ClaimRow(claim)
                    if (group.claims.size > shown.size) {
                        TextButton(onClick = { showAll = true }) {
                            Text("Show all ${group.claims.size}")
                        }
                    }
                }
            }
        }
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

/**
 * What this credential has been used to disclose, newest first.
 *
 * The log records which fields were disclosed; their values are read from the credential itself,
 * because what a relying party received is what the document says and not a copy the wallet kept.
 * A holder is therefore shown exactly what left the wallet, claim by claim.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivityScreen(
    repository: WalletRepository,
    credentialId: String,
    onBack: () -> Unit,
) {
    val activities = remember(credentialId) { repository.activity(credentialId) }
    val valuesByLabel = remember(credentialId) {
        repository.credentialClaims(credentialId)
            .flatMap { group -> group.claims }
            .associate { claim -> claim.label to claim.value }
    }
    // One entry open at a time: the screen is for reading one disclosure at a time, and every
    // entry opened at once is the same as none of them being readable.
    var expanded by remember { mutableStateOf<Int?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Activity") },
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
            Text(
                "Sharing activity",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "What this credential has been used to share, and with whom.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
            )
            if (activities.isEmpty()) {
                Spacer(Modifier.height(24.dp))
                Text(
                    "Nothing has been shared from this credential.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                activities.forEachIndexed { index, activity ->
                    Spacer(Modifier.height(12.dp))
                    ActivityCard(
                        activity = activity,
                        expanded = expanded == index,
                        claimValues = valuesByLabel,
                        onToggle = { expanded = if (expanded == index) null else index },
                    )
                }
            }
        }
    }
}

@Composable
private fun ActivityCard(
    activity: ShareActivity,
    expanded: Boolean,
    claimValues: Map<String, String>,
    onToggle: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable { onToggle() },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        activity.recipientName?.takeIf { it.isNotBlank() } ?: activity.recipient,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    // A named recipient is shown with the address it went to, so the entry is
                    // identifiable by something other than the name the holder typed.
                    activity.recipientName?.takeIf { it.isNotBlank() }?.let {
                        Text(
                            activity.recipient,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        activityLine(activity),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    if (expanded) "Hide" else "What was shared",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            if (expanded) {
                for ((namespace, elements) in activity.disclosure) {
                    Spacer(Modifier.height(14.dp))
                    Text(
                        ClaimCatalogue.sectionTitleFor(namespace).uppercase(),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                    )
                    for (element in elements) {
                        val label = ClaimCatalogue.labelFor(element)
                        DetailRow(label, claimValues[label])
                    }
                }
            }
        }
    }
}

/** The collapsed line: how it was shared, when, and how much of the document it covered. */
private fun activityLine(activity: ShareActivity): String = listOfNotNull(
    when (activity.method) {
        ShareActivityCodec.METHOD_PRESENTMENT -> "Presented to a website"
        else -> "Shared by link"
    },
    // A record with no time is shown as undated rather than as 1970, which would read as a
    // disclosure that never happened.
    activity.sharedAt.takeIf { it > 0L }?.let(::formatTimestamp),
    if (activity.sectionCount == 1) "1 section" else "${activity.sectionCount} sections",
    if (activity.claimCount == 1) "1 field" else "${activity.claimCount} fields",
).joinToString(" · ")

private fun formatTimestamp(epochMillis: Long): String =
    java.text.SimpleDateFormat("d MMM yyyy, HH:mm", java.util.Locale.getDefault())
        .format(java.util.Date(epochMillis))

private data class ShareCategory(val id: String, val label: String, val description: String)

private val ShareCategories = listOf(
    ShareCategory("personal", "Personal information", "Name and date of birth"),
    ShareCategory("qualification", "Qualification information", "Institution, degree and graduation date"),
    ShareCategory("transcript", "Transcript information", "Student ID, courses and status"),
)

/** Multi-step selective-disclosure share flow (alternative to DCAPI presentment). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareFlowScreen(
    repository: WalletRepository,
    credentialId: String,
    onDone: () -> Unit,
    onBack: () -> Unit,
) {
    // Only the categories this credential actually holds may be offered: the issuer refuses
    // the rest, and offering them would have the holder pick something that cannot be sent.
    val summary = remember(credentialId) { repository.credentialSummary(credentialId) }
    val availableCategories = remember(summary?.kind) {
        val held = AcademicNamespaces.namespacesOf(summary?.kind ?: AcademicNamespaces.KIND_UNKNOWN).toSet()
        ShareCategories.filter { category ->
            when (category.id) {
                "qualification" -> AcademicNamespaces.QUALIFICATION in held
                "transcript" -> AcademicNamespaces.TRANSCRIPT in held
                "personal" -> true
                else -> false
            }
        }
    }
    var step by remember { mutableStateOf(0) } // 0 = disclosure, 1 = recipient, 2 = success
    // Start with the credential's own academic section, so the holder does not have to guess
    // which of the offered sections is the one they are sharing.
    var selected by remember(credentialId) {
        mutableStateOf(
            availableCategories.map { it.id }.filter { it != "personal" }.toSet(),
        )
    }
    var recipientName by remember { mutableStateOf("") }
    var recipientEmail by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var termsAccepted by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var sharedTo by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    val submit: () -> Unit = {
        scope.launch {
            busy = true
            error = null
            repository.createShare(
                credentialId = credentialId,
                categories = selected.toList(),
                recipientName = recipientName,
                recipientEmail = recipientEmail,
                message = message,
            ).onSuccess { created ->
                val shareId = created.shareId ?: error("No share id returned")
                val deviceRequest = created.deviceRequest ?: error("No device request returned")
                val encryptionInfo = created.encryptionInfo ?: error("No encryption info returned")
                val origin = created.origin ?: error("No origin returned")
                repository.submitShare(
                    shareId = shareId,
                    credentialId = credentialId,
                    deviceRequest = deviceRequest,
                    encryptionInfo = encryptionInfo,
                    origin = origin,
                    // Named with the recipient the holder chose, so the record of the share says
                    // who it went to rather than only which verifier answered.
                    recipientEmail = recipientEmail,
                    recipientName = recipientName,
                )
                    .onSuccess {
                        sharedTo = recipientEmail
                        step = 2
                    }
                    .onFailure { error = it.message }
            }.onFailure { error = it.message }
            busy = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Share credential") },
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
            when (step) {
                0 -> {
                    Text(
                        "What would you like to share?",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Select the sections of this credential to disclose. Only the selected fields are sent.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.6f),
                    )
                    Spacer(Modifier.height(16.dp))
                    for (category in availableCategories) {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp)
                                .clickable {
                                    selected = if (category.id in selected) selected - category.id
                                    else selected + category.id
                                },
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (category.id in selected)
                                    MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surface,
                            ),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(category.label, fontWeight = FontWeight.Bold)
                                    Text(
                                        category.description,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Checkbox(
                                    checked = category.id in selected,
                                    onCheckedChange = { checked ->
                                        selected = if (checked) selected + category.id
                                        else selected - category.id
                                    },
                                )
                            }
                        }
                    }
                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = { step = 1 },
                        enabled = selected.isNotEmpty(),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) { Text("Continue", fontWeight = FontWeight.Bold) }
                }

                1 -> {
                    Text(
                        "Recipient details",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.height(16.dp))
                    OutlinedTextField(
                        value = recipientName,
                        onValueChange = { recipientName = it },
                        label = { Text("Recipient name") },
                        singleLine = true,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = recipientEmail,
                        onValueChange = { recipientEmail = it },
                        label = { Text("Recipient email") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = message,
                        onValueChange = { message = it },
                        label = { Text("Message (optional)") },
                        minLines = 2,
                        maxLines = 4,
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = termsAccepted,
                            onCheckedChange = { termsAccepted = it },
                        )
                        Text(
                            "I acknowledge and agree to the terms and conditions",
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    error?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                    Spacer(Modifier.height(20.dp))
                    Button(
                        onClick = submit,
                        enabled = !busy && recipientName.isNotBlank() && recipientEmail.isNotBlank() && termsAccepted,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(if (busy) "Sharing…" else "Share", fontWeight = FontWeight.Bold)
                    }
                }

                else -> {
                    Column(
                        Modifier.fillMaxWidth().padding(top = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            "Shared",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.height(10.dp))
                        Text(
                            "The selected information was shared with ${sharedTo ?: "the recipient"}.",
                            style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(24.dp))
                        Button(
                            onClick = onDone,
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            shape = RoundedCornerShape(14.dp),
                        ) { Text("Done", fontWeight = FontWeight.Bold) }
                    }
                }
            }
        }
    }
}
