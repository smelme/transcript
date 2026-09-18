package com.smartcollege.transcript.wallet.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

/**
 * One documented disclosure: what left the wallet, to whom, and when.
 *
 * A holder cannot check what they have already handed over if the wallet keeps no record of it,
 * and the record is theirs rather than the relying party's. It names the fields that were
 * disclosed instead of summarising them, because "some information" is not something a holder
 * can act on.
 */
data class ShareActivity(
    val credentialId: String,
    /** When the disclosure happened, in epoch milliseconds. */
    val sharedAt: Long,
    /** Who received it: the recipient's email, or the verified origin of the requesting site. */
    val recipient: String,
    /** The name the holder typed for the recipient. A presentment to a website has none. */
    val recipientName: String?,
    val method: String,
    /** Namespace to the element identifiers that were disclosed from it. */
    val disclosure: Map<String, List<String>>,
) {
    val claimCount: Int get() = disclosure.values.sumOf { it.size }
    val sectionCount: Int get() = disclosure.size
}

/** How a disclosure was made, so the log can say what kind of disclosure it was. */
object ShareActivityCodec {

    const val METHOD_EMAIL = "email"
    const val METHOD_PRESENTMENT = "presentment"

    fun encode(activities: List<ShareActivity>): String = buildJsonArray {
        for (activity in activities) {
            add(
                buildJsonObject {
                    put("credentialId", activity.credentialId)
                    put("sharedAt", activity.sharedAt)
                    put("recipient", activity.recipient)
                    put("recipientName", activity.recipientName)
                    put("method", activity.method)
                    putJsonObject("disclosure") {
                        for ((namespace, elements) in activity.disclosure) {
                            putJsonArray(namespace) {
                                for (element in elements) add(element)
                            }
                        }
                    }
                }
            )
        }
    }.toString()

    /**
     * Reads a stored log. A record that cannot be read is dropped rather than failing the whole
     * log: one damaged entry must not hide the rest of the holder's history.
     */
    fun decode(json: String?): List<ShareActivity> {
        if (json.isNullOrBlank()) return emptyList()
        val array = runCatching { Json.parseToJsonElement(json) }.getOrNull() as? JsonArray
            ?: return emptyList()
        return array.mapNotNull { element -> (element as? JsonObject)?.let(::read) }
    }

    private fun read(record: JsonObject): ShareActivity? {
        val credentialId = record.text("credentialId") ?: return null
        val recipient = record.text("recipient") ?: return null
        val disclosure = (record["disclosure"] as? JsonObject).orEmpty().mapValues { (_, value) ->
            (value as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        }
        return ShareActivity(
            credentialId = credentialId,
            // A record written before the time was stamped is shown as undated rather than as
            // 1970, which would read as a disclosure that never happened.
            sharedAt = record.number("sharedAt") ?: 0L,
            recipient = recipient,
            recipientName = record.text("recipientName"),
            method = record.text("method").orEmpty(),
            disclosure = disclosure,
        )
    }

    private fun JsonObject.text(key: String): String? =
        (this[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.number(key: String): Long? = (this[key] as? JsonPrimitive)?.longOrNull
}

/**
 * The log itself: newest first, and bounded.
 *
 * The order and the limit are decided on the way in, so the screen showing it never has to sort
 * or truncate, and a wallet used for years cannot grow an unbounded list of disclosures.
 */
object ShareActivityLog {

    const val MAX_PER_CREDENTIAL = 50

    fun record(existing: List<ShareActivity>, activity: ShareActivity): List<ShareActivity> =
        (listOf(activity) + existing).take(MAX_PER_CREDENTIAL)
}
