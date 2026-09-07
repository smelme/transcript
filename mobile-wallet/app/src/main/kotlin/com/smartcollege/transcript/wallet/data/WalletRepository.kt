package com.smartcollege.transcript.wallet.data

import android.content.Context

data class StoredCredential(
    val credentialId: String,
    val docType: String,
    val mdocBase64url: String,
    val deviceBound: Boolean,
    val summary: CredentialSummary,
)

/**
 * Orchestrates sign-in and credential claiming for the wallet, persisting the
 * access token and received mdocs via [SecureStore].
 */
class WalletRepository(private val client: IssuerClient, private val store: SecureStore) {

    /** Request a one-time code (normally emailed; returned in dev). */
    suspend fun requestOtp(email: String): Result<String?> = runCatching {
        val response = client.requestOtp(email)
        if (!response.success) error(response.error ?: "Could not send a code")
        response.otp
    }

    /** Exchange the emailed OTP for an access token and persist it. */
    suspend fun signIn(email: String, otp: String): Result<String> = runCatching {
        val response = client.exchangeToken(email, otp)
        val token = requireNotNull(response.accessToken) { response.error ?: "Sign-in failed" }
        store.saveAccessToken(token)
        store.saveOwnerEmail(response.email ?: email)
        token
    }

    /** Claim an issuance offer: one BFF call, the mdoc is returned and stored. */
    suspend fun claim(offerUrl: String): Result<StoredCredential> = runCatching {
        val token = store.accessToken() ?: error("Not signed in")
        val offer = Cwt.parseOffer(offerUrl) ?: error("Invalid credential offer")
        val deviceKey = store.getOrCreateDeviceKey()
        val cwt = Cwt.build(store.devicePrivateKey(), deviceKey.publicJwk, offer.issuerId, offer.nonce)
        val response = client.issue(offerUrl, token, cwt)
        require(response.success) { response.error ?: "Issuance failed" }
        val id = requireNotNull(response.credentialId)
        val mdoc = requireNotNull(response.mdocBase64url)
        val summary = MdocParser.readCredentialSummary(mdoc) ?: CredentialSummary()
        store.saveMdoc(id, mdoc, ownerEmail = store.ownerEmail())
        store.saveCredentialSummary(id, summary)
        StoredCredential(id, response.docType ?: "org.iso.23220.photoid.1", mdoc, response.deviceBound, summary)
    }

    /** Credential ids belonging to the currently signed-in account. */
    fun credentialIds(): List<String> = store.credentialIdsForOwner(store.ownerEmail())
    fun mdoc(credentialId: String): String? = store.mdoc(credentialId)

    /** Re-publish the current user's stored credentials to the Android Credential Manager registry. */
    fun registerWithSystem(context: Context) = CredentialRegistry.register(context, store, credentialIds())
    fun deleteCredential(credentialId: String): Result<Unit> = runCatching {
        check(store.deleteCredential(credentialId)) { "Could not delete credential from secure storage" }
    }

    fun credentialSummary(credentialId: String): CredentialSummary? {
        val stored = store.credentialSummary(credentialId)
        if (stored?.hasDisplayFields() == true) return stored

        val parsed = store.mdoc(credentialId)?.let(MdocParser::readCredentialSummary) ?: return stored
        store.saveCredentialSummary(credentialId, parsed)
        return parsed
    }

    private fun CredentialSummary.hasDisplayFields(): Boolean =
        fullName.isNotBlank() || institution.isNotBlank() || degreeLevel.isNotBlank() || graduationDate.isNotBlank()

    /**
     * Step 1 of sharing: ask the issuer to prepare a one-time verifier request
     * for the selected disclosure categories and return the DCAPI parameters
     * (deviceRequest + encryptionInfo + origin) the wallet needs to build the
     * encrypted envelope.
     */
    suspend fun createShare(
        credentialId: String,
        categories: List<String>,
        recipientName: String,
        recipientEmail: String,
        message: String,
    ): Result<ShareCreateResponse> = runCatching {
        val token = store.accessToken() ?: error("Not signed in")
        val response = client.createShare(
            ShareCreateRequest(
                accessToken = token,
                credentialId = credentialId,
                categories = categories,
                recipientName = recipientName,
                recipientEmail = recipientEmail,
                message = message,
            )
        )
        require(response.success) { response.error ?: "Could not prepare share" }
        response
    }

    /**
     * Step 2 of sharing: build the same HPKE-encrypted, selectively-disclosed
     * DeviceResponse the wallet uses for DCAPI presentment, and submit it to the
     * issuer, which forwards it to the verifier service.
     */
    suspend fun submitShare(
        shareId: String,
        credentialId: String,
        deviceRequest: String,
        encryptionInfo: String,
        origin: String,
    ): Result<Unit> = runCatching {
        val token = store.accessToken() ?: error("Not signed in")
        val mdoc = store.mdoc(credentialId) ?: error("Credential could not be unlocked")
        val envelope = com.smartcollege.transcript.wallet.presentation.MdocResponseBuilder.build(
            deviceRequestBase64Url = deviceRequest,
            encryptionInfoBase64Url = encryptionInfo,
            origin = origin,
            mdocBase64Url = mdoc,
            devicePrivateKey = store.devicePrivateKey(),
        )
        val response = client.submitShare(
            shareId,
            ShareSubmitRequest(
                accessToken = token,
                credential = ShareCredential(protocol = "org-iso-mdoc", data = envelope),
            )
        )
        require(response.success) { response.error ?: "Share failed" }
    }

    fun isSignedIn(): Boolean = store.accessToken() != null

    /** Clear the access token and owner so the wallet returns to the sign-in screen. */
    fun signOut() {
        store.clearAccessToken()
        store.clearOwnerEmail()
    }
}
