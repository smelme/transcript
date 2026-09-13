package com.smartcollege.transcript.wallet.data

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class OtpRequest(val email: String)

@Serializable
data class OtpResponse(val success: Boolean = false, val otp: String? = null, val error: String? = null)

@Serializable
data class TokenRequest(val email: String, val otp: String)

@Serializable
data class TokenResponse(
    val success: Boolean = false,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val sub: String? = null,
    val email: String? = null,
    val error: String? = null,
)

@Serializable
data class RefreshRequest(val refreshToken: String)

@Serializable
data class SignOutRequest(val refreshToken: String)

@Serializable
data class SimpleResponse(val success: Boolean = false, val error: String? = null)

@Serializable
data class IssuanceRequest(val offerUrl: String, val accessToken: String, val cwt: String)

@Serializable
data class CredentialSummary(
    val fullName: String = "",
    val institution: String = "",
    val degreeLevel: String = "",
    val graduationDate: String = "",
    /**
     * Which academic credential this is, derived from the namespace it holds. Both kinds
     * are issued under the photo-ID docType, so this is the only honest discriminator.
     */
    val kind: String = AcademicNamespaces.KIND_UNKNOWN,
    val fieldOfStudy: String = "",
    /**
     * Which programme the study was for, and the award it leads to. A transcript states both in
     * its own namespace, because a transcript can be issued on its own - and "Academic transcript
     * - Tessa Novak" does not tell a holder with two of them which qualification either belongs to.
     */
    val programmeTitle: String = "",
    val awardTitle: String = "",
    /**
     * The day the issuer signed the credential, which is not the day the study ended. Until this
     * existed, the card dated the credential by the graduation date and labelled it "Issued".
     */
    val issueDate: String = "",
    /** From the transcript namespace, which a qualification credential does not carry. */
    val courseCount: Int = 0,
    val totalCredits: Int = 0,
    val completionStatus: String = "",
)

@Serializable
data class IssuanceResponse(
    val success: Boolean = false,
    val docType: String? = null,
    val credentialId: String? = null,
    val mdocBase64url: String? = null,
    val deviceBound: Boolean = false,
    val error: String? = null,
)

@Serializable
data class ShareCreateRequest(
    val accessToken: String,
    val credentialId: String,
    val categories: List<String>,
    val recipientName: String,
    val recipientEmail: String,
    val message: String = "",
)

@Serializable
data class ShareCreateResponse(
    val success: Boolean = false,
    val shareId: String? = null,
    val status: String? = null,
    val deviceRequest: String? = null,
    val encryptionInfo: String? = null,
    val origin: String? = null,
    val error: String? = null,
)

@Serializable
data class ShareCredential(val protocol: String, val data: String)

@Serializable
data class ShareSubmitRequest(
    val accessToken: String,
    val credential: ShareCredential,
)

@Serializable
data class ShareSubmitResponse(
    val success: Boolean = false,
    val shareId: String? = null,
    val status: String? = null,
    val error: String? = null,
)

/**
 * HTTP client for the issuer's wallet-facing endpoints:
 *   POST /auth/otp, POST /auth/token, POST /wallet/issuance, POST /shares
 */
class IssuerClient(private val baseUrl: String) {

    private val client = HttpClient {
        install(ContentNegotiation) {
            json(Json { ignoreUnknownKeys = true })
        }
    }

    suspend fun requestOtp(email: String): OtpResponse =
        client.post("$baseUrl/auth/otp") {
            contentType(ContentType.Application.Json)
            setBody(OtpRequest(email))
        }.body()

    suspend fun exchangeToken(email: String, otp: String): TokenResponse =
        client.post("$baseUrl/auth/token") {
            contentType(ContentType.Application.Json)
            setBody(TokenRequest(email, otp))
        }.body()

    suspend fun refresh(refreshToken: String): TokenResponse =
        client.post("$baseUrl/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(RefreshRequest(refreshToken))
        }.body()

    suspend fun signOut(refreshToken: String): SimpleResponse =
        client.post("$baseUrl/auth/signout") {
            contentType(ContentType.Application.Json)
            setBody(SignOutRequest(refreshToken))
        }.body()

    suspend fun issue(offerUrl: String, accessToken: String, cwt: String): IssuanceResponse =
        client.post("$baseUrl/wallet/issuance") {
            contentType(ContentType.Application.Json)
            setBody(IssuanceRequest(offerUrl, accessToken, cwt))
        }.body()

    suspend fun createShare(request: ShareCreateRequest): ShareCreateResponse =
        client.post("$baseUrl/shares") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()

    suspend fun submitShare(shareId: String, request: ShareSubmitRequest): ShareSubmitResponse =
        client.post("$baseUrl/shares/${shareId}/response") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()
}
