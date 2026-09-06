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
data class TokenResponse(val success: Boolean = false, val accessToken: String? = null, val sub: String? = null, val email: String? = null, val error: String? = null)

@Serializable
data class IssuanceRequest(val offerUrl: String, val accessToken: String, val cwt: String)

@Serializable
data class CredentialSummary(
    val fullName: String = "",
    val institution: String = "",
    val degreeLevel: String = "",
    val graduationDate: String = "",
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

/**
 * HTTP client for the issuer's wallet-facing endpoints:
 *   POST /auth/otp, POST /auth/token, POST /wallet/issuance
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

    suspend fun issue(offerUrl: String, accessToken: String, cwt: String): IssuanceResponse =
        client.post("$baseUrl/wallet/issuance") {
            contentType(ContentType.Application.Json)
            setBody(IssuanceRequest(offerUrl, accessToken, cwt))
        }.body()
}
