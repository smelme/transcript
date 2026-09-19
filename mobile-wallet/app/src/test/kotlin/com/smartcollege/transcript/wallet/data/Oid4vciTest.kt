package com.smartcollege.transcript.wallet.data

import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Reading what an issuer publishes, and proving possession of the key a credential is bound to.
 *
 * Both are pure: the offer and the metadata are parsed from text, and the proof is a signature over
 * a JWT this wallet built. That is deliberate - these are the parts that must be right before any
 * request is sent.
 */
class Oid4vciTest {

    private fun offerUrl(offer: String): String =
        "openid-credential-offer://?credential_offer=" +
            Base64.getUrlEncoder().withoutPadding().encodeToString(offer.toByteArray())

    private val standardOffer = """
        {
          "credential_issuer": "https://issuer.test",
          "credential_configuration_ids": ["org.iso.23220.photoid.1"],
          "grants": {
            "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
              "pre-authorized_code": "oaKazRN8I0IbtZ0C7JuMn5"
            }
          }
        }
    """.trimIndent()

    @Test
    fun `reads a standard credential offer`() {
        val offer = CredentialOffer.parse(offerUrl(standardOffer))

        assertEquals("https://issuer.test", offer?.credentialIssuer)
        assertEquals(listOf("org.iso.23220.photoid.1"), offer?.configurationIds)
        assertEquals("oaKazRN8I0IbtZ0C7JuMn5", offer?.preAuthorizedCode)
    }

    @Test
    fun `an offer that is not a standard one reads as nothing, so the other path keeps working`() {
        // Our own offers carry a raw session id and a bespoke payload. Guessing at them here would
        // break the claim path the wallet has always used.
        assertNull(CredentialOffer.parse("openid-credential-offer://?credential_offer=not-base64-json"))
        assertNull(CredentialOffer.parse("d7c2f0aa-0000-4000-8000-000000000000"))
        assertNull(CredentialOffer.parse("https://academy.test/claim?email=a%40b.c"))
        assertNull(
            CredentialOffer.parse(
                "openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.test%2Foffer",
            ),
        )
    }

    @Test
    fun `an offer with no authorization code is still readable, and unusable`() {
        val offer = CredentialOffer.parse(
            offerUrl("""{"credential_issuer":"https://issuer.test","credential_configuration_ids":["a"]}"""),
        )

        assertEquals("https://issuer.test", offer?.credentialIssuer)
        assertNull("an authorization code flow is not one this wallet can complete", offer?.preAuthorizedCode)
    }

    @Test
    fun `reads the issuer's metadata, including its names for its own claims`() {
        val metadata = IssuerMetadata.parse(
            """
            {
              "credential_issuer": "https://issuer.test",
              "credential_endpoint": "https://issuer.test/credential",
              "nonce_endpoint": "https://issuer.test/nonce",
              "notification_endpoint": "https://issuer.test/notification",
              "display": [{"name": "Smart Academy", "background_color": "#1B3A6B", "text_color": "#FFFFFF"}],
              "credential_configurations_supported": {
                "org.iso.23220.photoid.1": {
                  "format": "mso_mdoc",
                  "doctype": "org.iso.23220.photoid.1",
                  "credential_metadata": {
                    "display": [{"name": "Academic credential"}],
                    "claims": [
                      {"path": ["org.iso.23220.photoid.1", "given_name"], "display": [{"name": "Given name"}]},
                      {"path": ["org.iso.23220.education.transcript.1", "student_id"], "display": [{"name": "Student ID"}]}
                    ]
                  }
                }
              }
            }
            """.trimIndent(),
        )

        assertNotNull(metadata)
        assertEquals("https://issuer.test/credential", metadata?.credentialEndpoint)
        assertEquals("https://issuer.test/notification", metadata?.notificationEndpoint)
        assertEquals("Smart Academy", metadata?.displayName)
        assertEquals("#1B3A6B", metadata?.backgroundColor)

        val configuration = metadata?.configurationFor(listOf("org.iso.23220.photoid.1"))
        assertEquals("mso_mdoc", configuration?.format)
        assertEquals("Given name", configuration?.claimLabels?.get("given_name"))
        assertEquals("Student ID", configuration?.claimLabels?.get("student_id"))
    }

    @Test
    fun `metadata without a credential endpoint is not metadata`() {
        assertNull(IssuerMetadata.parse("not json"))
        assertNull(IssuerMetadata.parse("""{"credential_issuer":"https://issuer.test"}"""))
        assertNull(
            IssuerMetadata.parse(
                """{"credential_issuer":"https://i","credential_endpoint":"https://i/c","credential_configurations_supported":{}}""",
            ),
        )
    }

    @Test
    fun `the proof is an ES256 JWT the issuer can check, carrying the key and the nonce`() {
        val generator = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }
        val pair = generator.generateKeyPair()
        val jwk = mapOf(
            "kty" to "EC",
            "crv" to "P-256",
            "x" to "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
            "y" to "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
        )

        val proof = ProofOfPossession.build(
            privateKey = pair.private,
            publicJwk = jwk,
            audience = "https://issuer.test",
            nonce = "wKI4LT17ac15ES9bw8ac4",
            issuedAtSeconds = 1_760_000_000,
        )

        val parts = proof.split('.')
        assertEquals(3, parts.size)

        val header = String(Base64.getUrlDecoder().decode(parts[0]))
        assertTrue(header.contains("\"typ\":\"${ProofOfPossession.TYPE}\""))
        assertTrue("the identity of the key travels with the proof", header.contains("\"kty\":\"EC\""))

        val payload = String(Base64.getUrlDecoder().decode(parts[1]))
        assertTrue(payload.contains("\"aud\":\"https://issuer.test\""))
        assertTrue(payload.contains("\"nonce\":\"wKI4LT17ac15ES9bw8ac4\""))
        assertTrue(payload.contains("\"iat\":1760000000"))

        // The signature has to verify against the key the header names, in raw r||s form.
        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(pair.public)
        verifier.update("${parts[0]}.${parts[1]}".toByteArray())
        val p1363 = Base64.getUrlDecoder().decode(parts[2])
        assertEquals("an ES256 signature is 64 bytes of r||s", 64, p1363.size)
        assertTrue("the proof verifies against its own key", verifier.verify(der(p1363)))
    }

    @Test
    fun `no nonce is no problem when the issuer does not ask for one`() {
        val generator = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }
        val pair = generator.generateKeyPair()

        val proof = ProofOfPossession.build(pair.private, mapOf("kty" to "EC"), "https://i", null)

        val payload = String(Base64.getUrlDecoder().decode(proof.split('.')[1]))
        assertTrue("an absent nonce is absent, not empty", !payload.contains("nonce"))
    }

    @Test
    fun `reads the credential and the notification id out of a credential response`() {
        val response = ProofOfPossession.credentialOf(
            """{"credentials":[{"credential":"omppc3N1ZXJBdXRohEOhASah"}],"notification_id":"3fwe98js"}""",
        )

        assertEquals("omppc3N1ZXJBdXRohEOhASah", response?.mdocBase64url)
        assertEquals("3fwe98js", response?.notificationId)
        assertNull(ProofOfPossession.credentialOf("""{"credentials":[]}"""))
        assertNull(ProofOfPossession.credentialOf("not json"))
    }

    /** Java's verifier wants DER; the JWS carries raw r||s, so convert back for the assertion. */
    private fun der(p1363: ByteArray): ByteArray {
        fun integer(offset: Int): ByteArray {
            var start = offset
            while (start < offset + 32 && p1363[start] == 0.toByte()) start++
            val value = p1363.copyOfRange(start, offset + 32)
            return if (value[0].toInt() < 0) byteArrayOf(0) + value else value
        }
        val r = integer(0)
        val s = integer(32)
        return byteArrayOf(0x30, (4 + r.size + s.size).toByte(), 0x02, r.size.toByte()) + r +
            byteArrayOf(0x02, s.size.toByte()) + s
    }
}
