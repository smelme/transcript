package com.smartcollege.transcript.wallet.data

import java.math.BigInteger
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Cryptographic helpers for the wallet's org-iso-mdoc (ISO/IEC 18013-7 Annex C) path. */
object CryptoUtil {

    private const val CURVE = "secp256r1"

    fun sha256(bytes: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(bytes)

    fun base64UrlEncode(bytes: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)

    fun base64UrlDecode(value: String): ByteArray = Base64.getUrlDecoder().decode(value)

    /** Extract the P-256 x/y coordinates from a decoded COSE_Key map. */
    fun coseKeyToPoint(coseKey: Any?): Pair<ByteArray, ByteArray> {
        val map = coseKey as? Map<*, *> ?: error("recipientPublicKey is not a COSE_Key")
        val x = map[-2L] as? ByteArray ?: error("COSE_Key missing x coordinate")
        val y = map[-3L] as? ByteArray ?: error("COSE_Key missing y coordinate")
        return x to y
    }

    /** Build an ECPublicKey from uncompressed coordinates. */
    fun publicKeyFromCoordinates(x: ByteArray, y: ByteArray): ECPublicKey {
        val parameters = AlgorithmParameters.getInstance("EC")
        parameters.init(ECGenParameterSpec(CURVE))
        val ecParameterSpec = parameters.getParameterSpec(ECParameterSpec::class.java)
        val point = ECPoint(BigInteger(1, x), BigInteger(1, y))
        val keyFactory = KeyFactory.getInstance("EC")
        return keyFactory.generatePublic(ECPublicKeySpec(point, ecParameterSpec)) as ECPublicKey
    }

    fun uncompressedPoint(key: ECPublicKey): ByteArray {
        val size = (key.params.curve.field.fieldSize + 7) / 8
        val out = ByteArray(1 + 2 * size)
        out[0] = 0x04
        copyFixed(key.w.affineX, size, out, 1)
        copyFixed(key.w.affineY, size, out, 1 + size)
        return out
    }

    private fun copyFixed(value: BigInteger, size: Int, out: ByteArray, offset: Int) {
        val bytes = value.toByteArray()
        val trimmed = when {
            bytes.size == size -> bytes
            bytes.size > size -> bytes.copyOfRange(bytes.size - size, bytes.size)
            else -> ByteArray(size).also { bytes.copyInto(it, size - bytes.size) }
        }
        trimmed.copyInto(out, offset)
    }

    /** ES256 (P-256 + SHA-256) signature over `data`, returned in IEEE P1363 (r||s) form. */
    fun ecdsaSignP1363(privateKey: PrivateKey, data: ByteArray): ByteArray {
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(privateKey)
        signer.update(data)
        val der = signer.sign()
        return derToP1363(der, 32)
    }

    private fun derToP1363(der: ByteArray, componentSize: Int): ByteArray {
        // DER: 0x30 len 0x02 lenR R 0x02 lenS S
        var i = 2
        require(der[0] == 0x30.toByte()) { "Not a DER signature" }
        require(der[i] == 0x02.toByte()) { "Bad R" }
        val lenR = der[i + 1].toInt() and 0xff
        i += 2
        var r = der.copyOfRange(i, i + lenR)
        i += lenR
        require(der[i] == 0x02.toByte()) { "Bad S" }
        val lenS = der[i + 1].toInt() and 0xff
        i += 2
        var s = der.copyOfRange(i, i + lenS)
        if (r.size > componentSize) r = r.copyOfRange(r.size - componentSize, r.size)
        if (s.size > componentSize) s = s.copyOfRange(s.size - componentSize, s.size)
        return ByteArray(2 * componentSize).also {
            r.copyInto(it, componentSize - r.size)
            s.copyInto(it, 2 * componentSize - s.size)
        }
    }

    // ── HPKE base mode: DHKEM(P-256), HKDF-SHA256, AES-128-GCM ──
    //
    // Implemented to match the `@hpke/core` reference used by the independent
    // verifier (via `id-verifier`). Note the KEM derivation uses the per-KEM
    // suite id ("KEM" || kem_id) while the key schedule uses the full ciphersuite
    // id ("HPKE" || kem_id || kdf_id || aead_id), and the key schedule follows
    // the draft-era ExtractAndExpand structure (secret as HKDF ikm, key/base_nonce
    // expanded directly from the shared secret).

    private val kemId = byteArrayOf(0x00, 0x10)
    private val kdfId = byteArrayOf(0x00, 0x01)
    private val aeadId = byteArrayOf(0x00, 0x01)
    private val hpkeV1 = "HPKE-v1".toByteArray()
    private val suiteId: ByteArray = "HPKE".toByteArray() + kemId + kdfId + aeadId
    private val kemSuiteId: ByteArray = "KEM".toByteArray() + kemId

    /**
     * Encrypts `plaintext` to the recipient P-256 key under `info`.
     * Returns the encapsulated ephemeral public key (`enc`, uncompressed) and the ciphertext.
     */
    fun hpkeEncrypt(
        recipientPublicKey: ECPublicKey,
        info: ByteArray,
        plaintext: ByteArray,
    ): Pair<ByteArray, ByteArray> {
        val ephemeral = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec(CURVE))
        }.generateKeyPair()
        val enc = uncompressedPoint(ephemeral.public as ECPublicKey)

        val dh = KeyAgreement.getInstance("ECDH").apply {
            init(ephemeral.private)
            doPhase(recipientPublicKey, true)
        }.generateSecret()

        val pkRm = uncompressedPoint(recipientPublicKey)
        val kemContext = enc + pkRm

        // KEM shared secret (per-KEM suite id).
        val eaePrk = labeledExtract(ByteArray(32), "eae_prk", dh, kemSuiteId)
        val sharedSecret = hkdfExpand(
            eaePrk,
            labeledInfo("shared_secret", kemContext, 32, kemSuiteId),
            32,
        )

        val (key, baseNonce) = keySchedule(sharedSecret, info)

        return enc to aeadSeal(key, baseNonce, plaintext, ByteArray(0))
    }

    private fun keySchedule(sharedSecret: ByteArray, info: ByteArray): Pair<ByteArray, ByteArray> {
        val pskIdHash = labeledExtract(ByteArray(32), "psk_id_hash", ByteArray(0), suiteId)
        val infoHash = labeledExtract(ByteArray(32), "info_hash", info, suiteId)
        val keyScheduleContext = byteArrayOf(0x00) + pskIdHash + infoHash
        val secretIkm = hpkeV1 + suiteId + "secret".toByteArray() // psk is empty
        val key = extractAndExpand(sharedSecret, secretIkm, labeledInfo("key", keyScheduleContext, 16, suiteId), 16)
        val baseNonce = extractAndExpand(sharedSecret, secretIkm, labeledInfo("base_nonce", keyScheduleContext, 12, suiteId), 12)
        return key to baseNonce
    }

    // HKDF-Extract then HKDF-Expand (single PRK derivation).
    private fun extractAndExpand(salt: ByteArray, ikm: ByteArray, info: ByteArray, length: Int): ByteArray {
        val prk = hmacSha256(salt, ikm)
        return hkdfExpand(prk, info, length)
    }

    private fun labeledExtract(salt: ByteArray, label: String, ikm: ByteArray, suite: ByteArray): ByteArray {
        val labeledIkm = hpkeV1 + suite + label.toByteArray() + ikm
        return hmacSha256(salt, labeledIkm)
    }

    private fun labeledInfo(label: String, info: ByteArray, length: Int, suite: ByteArray): ByteArray {
        return i2osp(length, 2) + hpkeV1 + suite + label.toByteArray() + info
    }

    private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }

    private fun hkdfExpand(prk: ByteArray, info: ByteArray, length: Int): ByteArray {
        val out = ByteArray(length)
        var offset = 0
        var t = ByteArray(0)
        var counter = 1
        while (offset < length) {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(prk, "HmacSHA256"))
            mac.update(t)
            mac.update(info)
            mac.update(counter.toByte())
            t = mac.doFinal()
            val toCopy = minOf(t.size, length - offset)
            t.copyInto(out, offset, 0, toCopy)
            offset += toCopy
            counter++
        }
        return out
    }

    private fun i2osp(value: Int, length: Int): ByteArray {
        val out = ByteArray(length)
        for (i in 0 until length) out[length - 1 - i] = (value ushr (8 * i)).toByte()
        return out
    }

    private fun aeadSeal(key: ByteArray, baseNonce: ByteArray, plaintext: ByteArray, aad: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, baseNonce))
        if (aad.isNotEmpty()) cipher.updateAAD(aad)
        return cipher.doFinal(plaintext)
    }
}
