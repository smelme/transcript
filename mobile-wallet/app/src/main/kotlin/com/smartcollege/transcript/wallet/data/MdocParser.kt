package com.smartcollege.transcript.wallet.data

import java.nio.ByteBuffer
import java.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray

/**
 * Reads issuer-signed display claims from the stored mdoc. The data used by the
 * certificate card is never taken from a separate issuer response field.
 */
object MdocParser {

    fun readCredentialSummary(mdocBase64url: String): CredentialSummary? = runCatching {
        val issuerSigned = CborDecoder(Base64.getUrlDecoder().decode(mdocBase64url)).read() as? Map<*, *>
            ?: return null
        val namespaces = issuerSigned["nameSpaces"] as? Map<*, *> ?: return null
        // Which namespaces are present is what decides the kind: a transcript and a
        // qualification are both photo-ID documents, so the docType cannot tell them apart.
        val present = namespaces.keys.filterIsInstance<String>()
        val photoId = readNamespace(namespaces[AcademicNamespaces.PHOTO_ID])
        val qualification = readNamespace(namespaces[AcademicNamespaces.QUALIFICATION])
        val transcript = readNamespace(namespaces[AcademicNamespaces.TRANSCRIPT])

        val givenName = photoId["given_name"] as? String
        val familyName = photoId["family_name"] as? String
        // The programme and its award are read from whichever namespace carries them. A
        // qualification states them, and so does a transcript - which is issued on its own, so
        // without this the holder cannot tell which qualification a transcript belongs to.
        val programmeTitle =
            (qualification["programme_title"] ?: transcript["programme_title"]) as? String ?: ""
        val awardTitle =
            (qualification["award_title"] ?: transcript["award_title"]) as? String ?: ""
        CredentialSummary(
            fullName = listOfNotNull(givenName, familyName).joinToString(" "),
            institution = (qualification["institution_name"] ?: photoId["issuing_authority"]) as? String ?: "",
            degreeLevel = qualification["degree_level"] as? String ?: "",
            graduationDate = qualification["graduation_date"] as? String ?: "",
            kind = AcademicNamespaces.kindOf(present),
            fieldOfStudy = qualification["field_of_study"] as? String ?: "",
            programmeTitle = programmeTitle,
            awardTitle = awardTitle,
            // The identity document's own issue date: when this credential was signed, which is
            // what "issued" means on the card.
            issueDate = photoId["issue_date"] as? String ?: "",
            courseCount = countCourses(transcript["courses"]),
            totalCredits = wholeNumber(transcript["total_credits"]),
            completionStatus = transcript["status"] as? String ?: "",
        )
    }.getOrNull()

    /**
     * Every namespace in a stored credential and every element it holds, in the order the issuer
     * signed them.
     *
     * The card draws a handful of these fields; a holder checking their own credential wants all
     * of them, so they are read generically here rather than through a second hand-written list
     * that would fall behind what the issuer signs.
     */
    fun readNamespaces(mdocBase64url: String): Map<String, Map<String, Any?>> = runCatching {
        val issuerSigned = CborDecoder(Base64.getUrlDecoder().decode(mdocBase64url)).read() as? Map<*, *>
            ?: return emptyMap()
        val namespaces = issuerSigned["nameSpaces"] as? Map<*, *> ?: return emptyMap()
        buildMap {
            for ((key, value) in namespaces) {
                val namespace = key as? String ?: continue
                put(namespace, readNamespace(value))
            }
        }
    }.getOrDefault(emptyMap())

    /** The course list is one JSON string claim, so what a holder wants is how many it holds. */
    private fun countCourses(value: Any?): Int {
        val json = value as? String ?: return 0
        return runCatching { Json.parseToJsonElement(json).jsonArray.size }.getOrDefault(0)
    }

    /** CBOR carries a number at whatever width it was written; credits are whole. */
    private fun wholeNumber(value: Any?): Int = when (value) {
        is Long -> value.toInt()
        is Int -> value
        is Double -> value.toInt()
        else -> 0
    }

    private fun readNamespace(value: Any?): Map<String, Any?> {
        val items = value as? List<*> ?: return emptyMap()
        return buildMap {
            for (item in items) {
                val tagged = item as? CborTag ?: continue
                if (tagged.number != 24L) continue
                val encodedItem = tagged.value as? ByteArray ?: continue
                val issuerSignedItem = CborDecoder(encodedItem).read() as? Map<*, *> ?: continue
                val identifier = issuerSignedItem["elementIdentifier"] as? String ?: continue
                put(identifier, unwrap(issuerSignedItem["elementValue"]))
            }
        }
    }

    private fun unwrap(value: Any?): Any? = when (value) {
        is CborTag -> unwrap(value.value)
        else -> value
    }
}

private data class CborTag(val number: Long, val value: Any?)

/** Minimal RFC 8949 decoder for the issuer-signed claims present in this wallet's mdocs. */
private class CborDecoder(private val bytes: ByteArray) {
    private var offset = 0

    fun read(): Any? {
        val initial = nextByte()
        val major = initial ushr 5
        val additional = initial and 0x1f
        val length = readLength(additional)
        return when (major) {
            0 -> length
            1 -> -1L - length
            2 -> bytes.copyOfRange(offset, offset + length.toInt()).also { offset += length.toInt() }
            3 -> bytes.copyOfRange(offset, offset + length.toInt()).also { offset += length.toInt() }
                .toString(Charsets.UTF_8)
            4 -> List(length.toInt()) { read() }
            5 -> buildMap<Any?, Any?> { repeat(length.toInt()) { put(read(), read()) } }
            6 -> CborTag(length, read())
            7 -> readSimple(additional, length)
            else -> error("Unsupported CBOR major type")
        }
    }

    private fun readSimple(additional: Int, length: Long): Any? = when (additional) {
        20 -> false
        21 -> true
        22, 23 -> null
        26 -> Float.fromBits(length.toInt())
        27 -> Double.fromBits(length)
        else -> length
    }

    private fun readLength(additional: Int): Long = when (additional) {
        in 0..23 -> additional.toLong()
        24 -> nextByte().toLong()
        25 -> readUnsigned(2)
        26 -> readUnsigned(4)
        27 -> readUnsigned(8)
        else -> error("Indefinite-length CBOR is not supported")
    }

    private fun readUnsigned(size: Int): Long {
        require(offset + size <= bytes.size) { "Unexpected end of CBOR" }
        val value = when (size) {
            2 -> ByteBuffer.wrap(bytes, offset, size).short.toLong() and 0xffff
            4 -> ByteBuffer.wrap(bytes, offset, size).int.toLong() and 0xffffffffL
            else -> ByteBuffer.wrap(bytes, offset, size).long
        }
        offset += size
        return value
    }

    private fun nextByte(): Int {
        require(offset < bytes.size) { "Unexpected end of CBOR" }
        return bytes[offset++].toInt() and 0xff
    }
}
