package com.smartcollege.transcript.wallet.data

import java.security.PrivateKey
import java.util.Base64
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** A claim or element value as text, or null when it is absent or blank. */
private fun JsonObject?.text(key: String): String? =
    ((this?.get(key)) as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

/**
 * A Credential Offer, as OpenID4VCI defines it.
 *
 * Only the pre-authorized code flow is understood: that is what an institution preparing a
 * credential for a known holder uses, and it is the flow this wallet can complete on its own
 * without an authorization server round trip.
 */
data class CredentialOffer(
    val credentialIssuer: String,
    val configurationIds: List<String>,
    val preAuthorizedCode: String?,
) {
    companion object {
        private const val GRANT = "urn:ietf:params:oauth:grant-type:pre-authorized_code"

        /**
         * Read an offer out of the URL a holder was given, or null when it is not one.
         *
         * Null is the useful answer: our own offer shape is not this, and the caller has another
         * way to claim it. A wallet that guessed here would break the path that already works.
         */
        fun parse(offerUrl: String): CredentialOffer? {
            val encoded = parameterOf(offerUrl, "credential_offer") ?: return null
            val json = runCatching {
                Json.parseToJsonElement(
                    String(Base64.getUrlDecoder().decode(encoded.padToBase64()), Charsets.UTF_8),
                )
            }.getOrNull() as? JsonObject ?: return null

            val issuer = json.text("credential_issuer") ?: return null
            val configurations = (json["credential_configuration_ids"] as? JsonArray)
                .orEmpty()
                .mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            if (configurations.isEmpty()) return null

            val grant = (json["grants"] as? JsonObject)?.get(GRANT) as? JsonObject
            return CredentialOffer(
                credentialIssuer = issuer,
                configurationIds = configurations,
                preAuthorizedCode = grant?.text("pre-authorized_code"),
            )
        }

        /** The value of one query parameter, in either a scheme URL or a plain https one. */
        private fun parameterOf(url: String, name: String): String? {
            val match = Regex("[?&]$name=([^&]+)").find(url) ?: return null
            return match.groupValues[1].takeIf { it.isNotBlank() }
        }

        private fun String.padToBase64(): String = when (length % 4) {
            2 -> this + "=="
            3 -> this + "="
            else -> this
        }
    }
}

/**
 * What an issuer publishes about itself, narrowed to what this wallet acts on.
 *
 * The display metadata is read rather than ignored: the issuer knows what its own credential is
 * called and how it should look, and a wallet that renders it that way agrees with every other
 * wallet in the ecosystem instead of carrying its own table.
 */
data class IssuerMetadata(
    val credentialIssuer: String,
    val credentialEndpoint: String,
    val nonceEndpoint: String?,
    val notificationEndpoint: String?,
    val displayName: String?,
    val backgroundColor: String?,
    val textColor: String?,
    val configurations: List<Configuration>,
) {
    data class Configuration(
        val id: String,
        val doctype: String,
        val format: String,
        val claimLabels: Map<String, String>,
    )

    /** The first configuration this wallet recognises out of the ones the offer named. */
    fun configurationFor(offeredIds: List<String>): Configuration? =
        offeredIds.firstNotNullOfOrNull { id -> configurations.firstOrNull { it.id == id } }
            ?: configurations.firstOrNull()

    companion object {
        fun parse(json: String): IssuerMetadata? {
            val root = runCatching { Json.parseToJsonElement(json) }.getOrNull() as? JsonObject
                ?: return null
            val issuer = root.text("credential_issuer") ?: return null
            val endpoint = root.text("credential_endpoint") ?: return null

            val supported = root["credential_configurations_supported"] as? JsonObject
            val configurations = supported?.entries?.mapNotNull { (id, value) ->
                val configuration = value as? JsonObject ?: return@mapNotNull null
                Configuration(
                    id = id,
                    // An mdoc's type is its doctype; anything else is not this wallet's format.
                    doctype = configuration.text("doctype") ?: id,
                    format = configuration.text("format") ?: "",
                    claimLabels = claimLabelsOf(configuration),
                )
            }.orEmpty()
            if (configurations.isEmpty()) return null

            val display = (root["display"] as? JsonArray)?.firstOrNull() as? JsonObject
            return IssuerMetadata(
                credentialIssuer = issuer,
                credentialEndpoint = endpoint,
                nonceEndpoint = root.text("nonce_endpoint"),
                notificationEndpoint = root.text("notification_endpoint"),
                displayName = display?.text("name"),
                backgroundColor = display?.text("background_color"),
                textColor = display?.text("text_color"),
                configurations = configurations,
            )
        }

        /** The issuer's names for its own claims, by element identifier. */
        private fun claimLabelsOf(configuration: JsonObject): Map<String, String> {
            val claims = (configuration["credential_metadata"] as? JsonObject)?.get("claims")
                as? JsonArray
            return claims?.mapNotNull { entry ->
                val claim = entry as? JsonObject ?: return@mapNotNull null
                val path = claim["path"] as? JsonArray ?: return@mapNotNull null
                // An mdoc claim path is [namespace, elementIdentifier].
                val identifier = (path.lastOrNull() as? JsonPrimitive)?.contentOrNull
                    ?: return@mapNotNull null
                val name = (claim["display"] as? JsonArray)?.firstOrNull()?.let { it as? JsonObject }
                    ?.text("name")
                    ?: return@mapNotNull null
                identifier to name
            }?.toMap() ?: emptyMap()
        }
    }
}

/**
 * The proof that the wallet holds the key a credential is to be bound to.
 *
 * An ES256 JWT, signed by the device key, addressed to the issuer, carrying the nonce the issuer
 * issued. The key travels in the header so the issuer can bind the credential to it.
 */
object ProofOfPossession {

    const val TYPE = "openid4vci-proof+jwt"

    fun build(
        privateKey: PrivateKey,
        publicJwk: Map<String, String>,
        audience: String,
        nonce: String?,
        issuedAtSeconds: Long = System.currentTimeMillis() / 1000,
    ): String {
        val header = buildJsonObject {
            put("alg", "ES256")
            put("typ", TYPE)
            put("jwk", buildJsonObject { publicJwk.forEach { (name, value) -> put(name, value) } })
        }
        val payload = buildJsonObject {
            put("aud", audience)
            put("iat", issuedAtSeconds)
            if (!nonce.isNullOrBlank()) put("nonce", nonce)
        }
        val signingInput = "${encode(header)}.${encode(payload)}"
        val signature = CryptoUtil.ecdsaSignP1363(privateKey, signingInput.toByteArray(Charsets.UTF_8))
        return "$signingInput.${Base64.getUrlEncoder().withoutPadding().encodeToString(signature)}"
    }

    private fun encode(value: JsonObject): String =
        Base64.getUrlEncoder().withoutPadding()
            .encodeToString(value.toString().toByteArray(Charsets.UTF_8))

    /** The pieces of a credential response that this wallet acts on. */
    fun credentialOf(json: String): CredentialResponse? {
        val root = runCatching { Json.parseToJsonElement(json) }.getOrNull() as? JsonObject
            ?: return null
        val first = ((root["credentials"] as? JsonArray).orEmpty().firstOrNull()) as? JsonObject
            ?: return null
        val credential = (first["credential"] as? JsonPrimitive)?.contentOrNull ?: return null
        val notificationId = (root["notification_id"] as? JsonPrimitive)?.contentOrNull
        return CredentialResponse(credential, notificationId)
    }

    data class CredentialResponse(val mdocBase64url: String, val notificationId: String?)
}

/** What the token endpoint returns: an access token, or the reason it would not. */
@Serializable
data class Oid4vciTokenResponse(
    @SerialName("access_token") val accessToken: String? = null,
    @SerialName("token_type") val tokenType: String? = null,
    @SerialName("expires_in") val expiresIn: Int? = null,
    val error: String? = null,
)

@Serializable
data class Oid4vciNonceResponse(@SerialName("c_nonce") val cNonce: String? = null)

@Serializable
data class Oid4vciProofs(val jwt: List<String>)

@Serializable
data class Oid4vciCredentialRequest(
    @SerialName("credential_configuration_id") val configurationId: String,
    val proofs: Oid4vciProofs,
)

@Serializable
data class Oid4vciCredentialResponse(
    val credentials: List<Credential> = emptyList(),
    @SerialName("notification_id") val notificationId: String? = null,
    val error: String? = null,
) {
    @Serializable
    data class Credential(val credential: String = "")
}

@Serializable
data class Oid4vciNotification(
    @SerialName("notification_id") val notificationId: String,
    val event: String,
)
