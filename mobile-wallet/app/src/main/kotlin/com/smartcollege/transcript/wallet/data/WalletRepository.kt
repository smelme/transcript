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
        store.saveMdoc(id, mdoc)
        store.saveCredentialSummary(id, summary)
        StoredCredential(id, response.docType ?: "org.iso.23220.photoid.1", mdoc, response.deviceBound, summary)
    }

    fun credentialIds(): List<String> = store.credentialIds()
    fun mdoc(credentialId: String): String? = store.mdoc(credentialId)

    /** Re-publish stored credentials to the Android Credential Manager registry. */
    fun registerWithSystem(context: Context) = CredentialRegistry.register(context, store)
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

    fun isSignedIn(): Boolean = store.accessToken() != null

    /** Clear the access token so the wallet returns to the sign-in screen. */
    fun signOut() {
        store.clearAccessToken()
    }
}
