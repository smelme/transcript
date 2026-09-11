package com.smartcollege.transcript.wallet.data

import android.content.Context
import android.util.Log
import com.google.android.gms.identitycredentials.IdentityCredentialManager
import com.google.android.gms.identitycredentials.RegistrationRequest

/**
 * Publishes the wallet's stored mdocs to the Android Credential Manager
 * (Google Play Services Identity Credential registry) so that Chrome's W3C
 * Digital Credentials API (`org-iso-mdoc`) can discover and present them.
 *
 * Without this registration step Chrome's credential chooser has nothing to
 * display, which surfaces as "No info available to share".
 */
object CredentialRegistry {

    private const val TAG = "CredentialRegistry"

    private const val ACADEMIC_DOC_TYPE = "org.iso.23220.photoid.1"
    private const val TYPE_LEGACY = "com.credman.IdentityCredential"
    private const val TYPE_DIGITAL = "androidx.credentials.TYPE_DIGITAL_CREDENTIAL"

    private val displayNames = mapOf(
        "given_name" to "Given name",
        "family_name" to "Family name",
        "birth_date" to "Date of birth",
        "issuing_authority" to "Issuing authority",
        "institution_name" to "Institution",
        "degree_level" to "Degree level",
        "graduation_date" to "Graduation date",
    )

    /** Re-publishes the given credentials (already scoped to the current owner) to the system registry. Safe to call repeatedly. */
    fun register(context: Context, store: SecureStore, credentialIds: List<String> = store.credentialIdsForOwner(store.ownerEmail())) {
        try {
            val credentials = buildCredentialEntries(store, credentialIds)
            // Publish the count: a registration that silently drops credentials is
            // invisible otherwise, and it replaces whatever the chooser shows.
            if (credentials.size != credentialIds.size) {
                Log.w(TAG, "publishing ${credentials.size} of ${credentialIds.size} credentials; the rest were unreadable or unparseable")
            } else {
                Log.i(TAG, "publishing all ${credentials.size} credentials")
            }

            val database = CborCodec.encode(
                mapOf<String, Any?>(
                    "protocols" to listOf(ACADEMIC_DOC_TYPE),
                    "credentials" to credentials,
                )
            )
            val matcher = loadMatcher(context)
            val client = IdentityCredentialManager.getClient(context)

            for (type in listOf(TYPE_LEGACY, TYPE_DIGITAL)) {
                client.registerCredentials(
                    RegistrationRequest(
                        credentials = database,
                        matcher = matcher,
                        type = type,
                        requestType = "",
                        protocolTypes = emptyList(),
                    )
                )
                    .addOnSuccessListener { Log.i(TAG, "registerCredentials OK type=$type n=${credentials.size}") }
                    .addOnFailureListener { Log.w(TAG, "registerCredentials failed type=$type: $it") }
            }
        } catch (e: Throwable) {
            Log.e(TAG, "register failed", e)
        }
    }

    private fun loadMatcher(context: Context): ByteArray {
        return context.assets.open("identitycredentialmatcher.wasm").use { it.readBytes() }
    }

    private fun buildCredentialEntries(store: SecureStore, credentialIds: List<String>): List<Map<String, Any?>> =
        credentialIds.mapNotNull { id ->
            val mdoc = store.mdoc(id)
            if (mdoc == null) {
                // The mdoc body is wrapped with an auth-bound key, so it is briefly
                // unreadable while the device is locked.
                Log.w(TAG, "skipping $id: mdoc not readable (locked or missing)")
                return@mapNotNull null
            }
            // One unusable credential must not abort the whole registration: a
            // failure here used to leave the system registry stale, so the chooser
            // kept showing an outdated set of credentials.
            runCatching { buildCredentialEntry(id, mdoc, store.credentialSummary(id)) }
                .onFailure { Log.w(TAG, "skipping $id: could not build registry entry: ${it.message}") }
                .getOrNull()
        }

    /** Internal (not private) so it can be exercised from unit tests without a device. */
    internal fun buildCredentialEntry(
        credentialId: String,
        mdocBase64Url: String,
        summary: CredentialSummary?,
    ): Map<String, Any?> {
        val issuerSigned = CborCodec.decode(CryptoUtil.base64UrlDecode(mdocBase64Url)) as? Map<*, *>
            ?: return emptyCredentialEntry(credentialId)
        val namespaces = issuerSigned["nameSpaces"] as? Map<*, *> ?: emptyMap<Any?, Any?>()

        val namespacesCbor = LinkedHashMap<String, Any?>()
        for ((ns, items) in namespaces) {
            val itemList = items as? List<*> ?: continue
            val nsMap = LinkedHashMap<String, Any?>()
            for (item in itemList) {
                val tag = item as? CborTagged ?: continue
                if (tag.number != 24L) continue
                val itemCbor = tag.value as? ByteArray ?: continue
                val itemMap = CborCodec.decode(itemCbor) as? Map<*, *> ?: continue
                val elementId = itemMap["elementIdentifier"] as? String ?: continue
                val valueString = unwrap(itemMap["elementValue"])?.toString() ?: ""
                val displayName = displayNames[elementId] ?: elementId
                nsMap[elementId] = listOf(displayName, valueString, valueString.take(128))
            }
            if (nsMap.isNotEmpty()) namespacesCbor[ns as String] = nsMap
        }

        val title = summary?.fullName?.takeIf { it.isNotBlank() } ?: "Academic credential"
        val subtitle = summary?.institution?.takeIf { it.isNotBlank() } ?: "Academic credential"

        return mapOf<String, Any?>(
            "title" to title,
            "subtitle" to subtitle,
            "bitmap" to ByteArray(0),
            "mdoc" to mapOf<String, Any?>(
                "documentId" to credentialId,
                "docType" to ACADEMIC_DOC_TYPE,
                "namespaces" to namespacesCbor,
            ),
        )
    }

    private fun emptyCredentialEntry(credentialId: String): Map<String, Any?> = mapOf(
        "title" to "Academic credential",
        "subtitle" to "Academic credential",
        "bitmap" to ByteArray(0),
        "mdoc" to mapOf<String, Any?>(
            "documentId" to credentialId,
            "docType" to ACADEMIC_DOC_TYPE,
            "namespaces" to emptyMap<String, Any?>(),
        ),
    )

    private fun unwrap(value: Any?): Any? = when (value) {
        is CborTagged -> unwrap(value.value)
        else -> value
    }
}
