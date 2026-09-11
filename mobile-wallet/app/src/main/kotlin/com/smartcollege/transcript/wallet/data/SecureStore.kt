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
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

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

    fun saveRefreshToken(token: String) = prefs.edit().putString(KEY_REFRESH_TOKEN, token).apply()
    fun refreshToken(): String? = prefs.getString(KEY_REFRESH_TOKEN, null)
    fun clearRefreshToken() = prefs.edit().remove(KEY_REFRESH_TOKEN).apply()

    /** Persist which wallet account (email) currently owns the session. */
    fun saveOwnerEmail(email: String) = prefs.edit().putString(KEY_OWNER_EMAIL, email.trim().lowercase()).apply()
    fun ownerEmail(): String? = prefs.getString(KEY_OWNER_EMAIL, null)
    fun clearOwnerEmail() = prefs.edit().remove(KEY_OWNER_EMAIL).apply()

    /**
     * Store a received mdoc. The payload is wrapped with an AES key that only
     * the Android Keystore releases while the user is recently authenticated,
     * so the credential bytes cannot be decrypted without a fresh biometric /
     * device PIN. Legacy plaintext values (from earlier builds) remain readable.
     */
    fun saveMdoc(credentialId: String, mdocBase64url: String, ownerEmail: String? = null) {
        val stored = try {
            MDOC_PREFIX + encryptMdocBody(mdocBase64url)
        } catch (e: Throwable) {
            // No usable auth-bound key (e.g. device has no lock screen) — keep
            // the value in the (still EncryptedSharedPreferences-encrypted) store.
            android.util.Log.w(TAG, "mdoc auth-encrypt unavailable; storing plaintext", e)
            mdocBase64url
        }
        prefs.edit().putString("mdoc_$credentialId", stored).apply()
        if (ownerEmail != null) {
            prefs.edit().putString("owner_$credentialId", ownerEmail.trim().lowercase()).apply()
        }
        val ids = credentialIds().toMutableSet().apply { add(credentialId) }
        prefs.edit().putString(KEY_IDS, JSONArray(ids.toList()).toString()).apply()
    }

    /** The owning account email recorded when this credential was claimed, if any. */
    fun ownerEmailOf(credentialId: String): String? =
        prefs.getString("owner_$credentialId", null)?.takeIf { it.isNotBlank() }

    /**
     * Read a stored mdoc. Returns the plaintext when the user is recently
     * authenticated, otherwise null (callers should prompt for auth and retry).
     */
    fun mdoc(credentialId: String): String? {
        val raw = prefs.getString("mdoc_$credentialId", null) ?: return null
        return if (raw.startsWith(MDOC_PREFIX)) {
            try {
                decryptMdocBody(raw.removePrefix(MDOC_PREFIX))
            } catch (e: Throwable) {
                android.util.Log.w(TAG, "mdoc decrypt failed (locked?): $e")
                null
            }
        } else {
            raw // legacy plaintext from before auth-bound storage
        }
    }

    /** Get (or create) the AES key that requires recent user authentication. */
    private fun getOrCreateMdocAuthKey(): SecretKey {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (ks.getKey(KEY_MDOC_AUTH, null) as? SecretKey)?.let { return it }
        val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        kg.init(
            KeyGenParameterSpec.Builder(KEY_MDOC_AUTH, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true)
                .setUserAuthenticationValidityDurationSeconds(MDOC_AUTH_VALIDITY_SECONDS)
                .build()
        )
        return kg.generateKey()
    }

    private fun encryptMdocBody(plainText: String): String {
        val cipher = Cipher.getInstance(MDOC_TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateMdocAuthKey())
        val iv = cipher.iv
        val cipherText = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return Base64.getEncoder().encodeToString(iv + cipherText)
    }

    private fun decryptMdocBody(stored: String): String {
        val bytes = Base64.getDecoder().decode(stored)
        val iv = bytes.copyOfRange(0, 12)
        val cipherText = bytes.copyOfRange(12, bytes.size)
        val cipher = Cipher.getInstance(MDOC_TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateMdocAuthKey(), GCMParameterSpec(128, iv))
        return String(cipher.doFinal(cipherText), Charsets.UTF_8)
    }
    
    /** Permanently remove one credential and its derived display data from encrypted storage. */
    fun deleteCredential(credentialId: String): Boolean {
        val ids = credentialIds().filterNot { it == credentialId }
        return prefs.edit()
            .remove("mdoc_$credentialId")
            .remove("summary_$credentialId")
            .remove("owner_$credentialId")
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

    /** Credential ids that belong to the given account email. Empty when no owner is signed in. */
    fun credentialIdsForOwner(ownerEmail: String?): List<String> {
        val owner = ownerEmail?.trim()?.lowercase() ?: return emptyList()
        return credentialIds().filter { id -> ownerEmailOf(id) == owner }
    }

    companion object {
        private const val TAG = "SecureStore"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "transcript-wallet-device-key"
        private const val KEY_MDOC_AUTH = "transcript-wallet-mdoc-auth"
        private const val MDOC_TRANSFORMATION = "AES/GCM/NoPadding"
        private const val MDOC_AUTH_VALIDITY_SECONDS = 300
        private const val MDOC_PREFIX = "enc:v1:"
        private const val PREFS_FILE = "transcript-wallet-secure"
        private const val KEY_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_OWNER_EMAIL = "owner_email"
        private const val KEY_IDS = "credential_ids"
    }
}
