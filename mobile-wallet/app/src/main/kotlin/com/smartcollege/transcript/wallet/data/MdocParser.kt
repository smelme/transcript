package com.smartcollege.transcript.wallet.data

import java.nio.ByteBuffer
import java.util.Base64

/**
 * Reads issuer-signed display claims from the stored mdoc. The data used by the
 * certificate card is never taken from a separate issuer response field.
 */
object MdocParser {
    private const val PHOTO_ID_NAMESPACE = "org.iso.23220.photoid.1"
    private const val EDUCATION_NAMESPACE = "org.iso.23220.education.qualification.1"

    fun readCredentialSummary(mdocBase64url: String): CredentialSummary? = runCatching {
        val issuerSigned = CborDecoder(Base64.getUrlDecoder().decode(mdocBase64url)).read() as? Map<*, *>
            ?: return null
        val namespaces = issuerSigned["nameSpaces"] as? Map<*, *> ?: return null
        val photoId = readNamespace(namespaces[PHOTO_ID_NAMESPACE])
        val education = readNamespace(namespaces[EDUCATION_NAMESPACE])

        val givenName = photoId["given_name"] as? String
        val familyName = photoId["family_name"] as? String
        CredentialSummary(
            fullName = listOfNotNull(givenName, familyName).joinToString(" "),
            institution = (education["institution_name"] ?: photoId["issuing_authority"]) as? String ?: "",
            degreeLevel = education["degree_level"] as? String ?: "",
            graduationDate = education["graduation_date"] as? String ?: "",
        )
    }.getOrNull()

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
