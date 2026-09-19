package com.smartcollege.transcript.wallet.data

import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.util.Base64

/** The session id, nonce and issuer identifier parsed out of an offer URL. */
data class OfferDetails(val sessionId: String, val nonce: String, val issuerId: String)

/**
 * Minimal CBOR (RFC 8949) encoder. Just enough for CWT/COSE_Sign1.
 * Only ints, bstr, tstr, arrays and maps are needed here.
 */
object Cbor {
    fun uint(v: Long): ByteArray = intHeader(0, v)
    fun nint(v: Long): ByteArray = intHeader(1, -1L - v) // v is negative
    fun bstr(bytes: ByteArray): ByteArray = intHeader(2, bytes.size.toLong()) + bytes
    fun tstr(s: String): ByteArray = intHeader(3, s.toByteArray(Charsets.UTF_8).size.toLong()) +
        s.toByteArray(Charsets.UTF_8)

    fun array(vararg items: ByteArray): ByteArray {
        val head = intHeader(4, items.size.toLong())
        val total = items.sumOf { it.size }
        val out = ByteArray(head.size + total)
        head.copyInto(out, 0)
        var off = head.size
        for (item in items) {
            item.copyInto(out, off)
            off += item.size
        }
        return out
    }

    fun map(vararg entries: Pair<Long, ByteArray>): ByteArray {
        val head = intHeader(5, entries.size.toLong())
        val total = entries.sumOf { (k, v) -> (if (k >= 0) uint(k) else nint(k)).size + v.size }
        val out = ByteArray(head.size + total)
        head.copyInto(out, 0)
        var off = head.size
        for ((k, v) in entries) {
            val key = if (k >= 0) uint(k) else nint(k)
            key.copyInto(out, off)
            off += key.size
            v.copyInto(out, off)
            off += v.size
        }
        return out
    }

    private fun intHeader(major: Int, v: Long): ByteArray {
        val out = ByteArrayOutputStream()
        val prefix = major shl 5
        when {
            v < 24L -> out.write(prefix or v.toInt())
            v <= 0xFFL -> {
                out.write(prefix or 24)
                out.write(v.toInt())
            }
            v <= 0xFFFFL -> {
                out.write(prefix or 25)
                out.write(((v shr 8) and 0xFF).toInt())
                out.write((v and 0xFF).toInt())
            }
            v <= 0xFFFFFFFFL -> {
                out.write(prefix or 26)
                for (i in 3 downTo 0) out.write(((v shr (8 * i)) and 0xFF).toInt())
            }
            else -> {
                out.write(prefix or 27)
                for (i in 7 downTo 0) out.write(((v shr (8 * i)) and 0xFF).toInt())
            }
        }
        return out.toByteArray()
    }
}

/**
 * CWT (RFC 8392) proof-of-possession: a COSE_Sign1 signed with the wallet's
 * Android Keystore device key, carrying that key in the `cnf` claim (RFC 8747)
 * and bound to a specific offer nonce.
 */
object Cwt {
    private const val ALG_ES256 = -7L
    private const val CWT_ISS = 1L
    private const val CWT_SUB = 2L
    private const val CWT_AUD = 3L
    private const val CWT_EXP = 4L
    private const val CWT_IAT = 6L
    private const val CWT_CTI = 7L
    private const val CWT_CNF = 8L
    private const val CWT_NONCE = 100L

    private const val COSE_KEY_KTY = 1L
    private const val COSE_KEY_EC2 = 2L
    private const val COSE_KEY_CRV = -1L
    private const val COSE_KEY_P256 = 1L
    private const val COSE_KEY_X = -2L
    private const val COSE_KEY_Y = -3L
    private const val COSE_LABEL_ALG = 1L

    /** Extract { sessionId, nonce, issuerId } from an `openid-credential-offer://` URL. */
    fun parseOffer(offerUrl: String): OfferDetails? = runCatching {
        val encoded = offerUrl.substringAfter("credential_offer=").substringBefore('&')
        val json = String(Base64.getUrlDecoder().decode(encoded))
        val obj = JSONObject(json)
        val grants = obj.getJSONObject("grants")
        val pac = grants.getJSONObject("urn:ietf:params:oauth:grant-type:pre-authorized_code")
        OfferDetails(
            sessionId = pac.getString("pre-authorized_code"),
            nonce = pac.optString("nonce"),
            issuerId = obj.optString("issuer_id"),
        )
    }.getOrNull()

    /** Build and sign a CWT, returning the COSE_Sign1 bytes as base64url. */
    fun build(
        privateKey: PrivateKey,
        publicJwk: Map<String, String>,
        issuerId: String,
        nonce: String,
    ): String {
        val decoder = Base64.getUrlDecoder()
        val coseKey = Cbor.map(
            COSE_KEY_KTY to Cbor.uint(COSE_KEY_EC2),
            COSE_KEY_CRV to Cbor.uint(COSE_KEY_P256),
            COSE_KEY_X to Cbor.bstr(decoder.decode(publicJwk["x"])),
            COSE_KEY_Y to Cbor.bstr(decoder.decode(publicJwk["y"])),
        )
        val cnf = Cbor.map(1L to coseKey)

        val now = System.currentTimeMillis() / 1000
        val claims = Cbor.map(
            CWT_ISS to Cbor.tstr("smart-college-wallet"),
            CWT_SUB to Cbor.tstr("device-key"),
            CWT_AUD to Cbor.tstr(issuerId),
            CWT_EXP to Cbor.uint(now + 300),
            CWT_IAT to Cbor.uint(now),
            CWT_CTI to Cbor.bstr(ByteArray(16).also { SecureRandom().nextBytes(it) }),
            CWT_CNF to cnf,
            CWT_NONCE to Cbor.tstr(nonce),
        )

        val protected = Cbor.bstr(Cbor.map(COSE_LABEL_ALG to Cbor.nint(ALG_ES256)))
        val sigStruct = Cbor.array(
            Cbor.tstr("Signature1"),
            protected,
            Cbor.bstr(ByteArray(0)),
            Cbor.bstr(claims),
        )

        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey)
        signer.update(sigStruct)
        val rawSig = derToRawP1363(signer.sign())

        val cose = Cbor.array(
            protected,
            Cbor.map(), // empty unprotected header
            Cbor.bstr(claims),
            Cbor.bstr(rawSig),
        )
        return Base64.getUrlEncoder().withoutPadding().encodeToString(cose)
    }

    /** Convert a DER ECDSA signature to the raw r || s (IEEE P1363) form. */
    private fun derToRawP1363(der: ByteArray): ByteArray {
        var off = 0
        require(der[off++].toInt() == 0x30) { "bad DER: not a sequence" }
        off++ // total length (single byte for EC signatures)
        require(der[off++].toInt() == 0x02) { "bad DER: r missing" }
        var rLen = der[off++].toInt()
        val r = ByteArray(32)
        if (rLen > 32) {
            off++
            rLen--
        }
        der.copyInto(r, 32 - rLen, off, off + rLen)
        off += rLen
        require(der[off++].toInt() == 0x02) { "bad DER: s missing" }
        var sLen = der[off++].toInt()
        val s = ByteArray(32)
        if (sLen > 32) {
            off++
            sLen--
        }
        der.copyInto(s, 32 - sLen, off, off + sLen)
        return r + s
    }
}
