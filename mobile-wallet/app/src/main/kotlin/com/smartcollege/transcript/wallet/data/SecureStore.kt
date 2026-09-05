package com.smartcollege.transcript.wallet.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.util.Base64

data class DeviceKey(val keyAlias: String, val publicJwk: Map<String, String>)

/**
 * Device key (Android Keystore, EC P-256) + encrypted storage for the wallet's
 * access token and received mdocs (EncryptedSharedPreferences).
 *
 * The private key never leaves the Keystore; only the public JWK is exported to
 * the issuer for device-bound issuance.
 */
class SecureStore(context: Context) {

    private val prefs: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        prefs = EncryptedSharedPreferences.create(
            context,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    /** Returns the device key, generating a fresh P-256 key in the Keystore if absent. */
    fun getOrCreateDeviceKey(): DeviceKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val existing = ks.getEntry(KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
        if (existing != null) {
            return DeviceKey(KEY_ALIAS, publicJwk(existing.certificate.publicKey as ECPublicKey))
        }

        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
        generator.initialize(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build()
        )
        generator.generateKeyPair()

        val fresh = ks.getEntry(KEY_ALIAS, null) as KeyStore.PrivateKeyEntry
        return DeviceKey(KEY_ALIAS, publicJwk(fresh.certificate.publicKey as ECPublicKey))
    }

    /** Access the Keystore private key for signing proof-of-possession tokens. */
    fun devicePrivateKey(): java.security.PrivateKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        return (ks.getEntry(KEY_ALIAS, null) as KeyStore.PrivateKeyEntry).privateKey
    }

    /** Build the public JWK { kty, crv, x, y } from an EC P-256 public key. */
    private fun publicJwk(key: ECPublicKey): Map<String, String> {
        val size = (key.params.curve.field.fieldSize + 7) / 8
        val encoder = Base64.getUrlEncoder().withoutPadding()
        return mapOf(
            "kty" to "EC",
            "crv" to "P-256",
            "x" to encoder.encodeToString(bigIntToFixed(key.w.affineX, size)),
            "y" to encoder.encodeToString(bigIntToFixed(key.w.affineY, size))
        )
    }

    private fun bigIntToFixed(v: BigInteger, size: Int): ByteArray {
        val bytes = v.toByteArray()
        return when {
            bytes.size == size -> bytes
            bytes.size > size -> bytes.copyOfRange(bytes.size - size, bytes.size)
            else -> ByteArray(size).also { bytes.copyInto(it, size - bytes.size) }
        }
    }

    fun saveAccessToken(token: String) = prefs.edit().putString(KEY_TOKEN, token).apply()
    fun accessToken(): String? = prefs.getString(KEY_TOKEN, null)
    fun clearAccessToken() = prefs.edit().remove(KEY_TOKEN).apply()

    fun saveMdoc(credentialId: String, mdocBase64url: String) {
        prefs.edit().putString("mdoc_$credentialId", mdocBase64url).apply()
        val ids = credentialIds().toMutableSet().apply { add(credentialId) }
        prefs.edit().putString(KEY_IDS, JSONArray(ids.toList()).toString()).apply()
    }

    fun mdoc(credentialId: String): String? = prefs.getString("mdoc_$credentialId", null)
    
    /** Permanently remove one credential and its derived display data from encrypted storage. */
    fun deleteCredential(credentialId: String): Boolean {
        val ids = credentialIds().filterNot { it == credentialId }
        return prefs.edit()
            .remove("mdoc_$credentialId")
            .remove("summary_$credentialId")
            .putString(KEY_IDS, JSONArray(ids.toList()).toString())
            .commit()
    }

    fun saveCredentialSummary(credentialId: String, summary: CredentialSummary) {
        prefs.edit().putString(
            "summary_$credentialId",
            JSONObject()
                .put("fullName", summary.fullName)
                .put("institution", summary.institution)
                .put("degreeLevel", summary.degreeLevel)
                .put("graduationDate", summary.graduationDate)
                .toString()
        ).apply()
    }

    fun credentialSummary(credentialId: String): CredentialSummary? {
        val raw = prefs.getString("summary_$credentialId", null) ?: return null
        return runCatching {
            val value = JSONObject(raw)
            CredentialSummary(
                fullName = value.optString("fullName"),
                institution = value.optString("institution"),
                degreeLevel = value.optString("degreeLevel"),
                graduationDate = value.optString("graduationDate"),
            )
        }.getOrNull()
    }

    fun credentialIds(): List<String> {
        val raw = prefs.getString(KEY_IDS, "[]") ?: "[]"
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { arr.getString(it) }
    }

    companion object {
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "transcript-wallet-device-key"
        private const val PREFS_FILE = "transcript-wallet-secure"
        private const val KEY_TOKEN = "access_token"
        private const val KEY_IDS = "credential_ids"
    }
}
