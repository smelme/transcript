package com.smartcollege.transcript.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The wallet's CBOR decoder must handle major type 7 correctly: floats and
 * simple values encode their payload in the additional-information bits, so the
 * payload must be read exactly once.
 *
 * Regression: the decoder used to run the additional-information bits through
 * the length reader as well, consuming a float64's eight payload bytes twice.
 * The parse then desynchronised and threw "Unexpected end of CBOR", which
 * aborted the whole Credential Manager registration and left the system
 * credential chooser showing an out-of-date list (newer credentials such as a
 * numeric `gpa` silently never appeared).
 */
class CborCodecTest {

    private fun bytes(vararg values: Int): ByteArray =
        ByteArray(values.size) { values[it].toByte() }

    @Test
    fun `decodes a float64 map value`() {
        // {"gpa": 3.65} — the exact element value produced for a numeric gpa.
        val encoded = bytes(
            0xa1,
            0x63, 0x67, 0x70, 0x61, // "gpa"
            0xfb, 0x40, 0x0d, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, // float64 3.65
        )

        val decoded = CborCodec.decode(encoded) as Map<*, *>

        assertEquals(1, decoded.size)
        assertEquals(3.65, decoded["gpa"] as Double, 0.0)
    }

    @Test
    fun `decodes a float32 map value`() {
        val encoded = bytes(
            0xa1,
            0x61, 0x78, // "x"
            0xfa, 0x40, 0x69, 0x99, 0x9a, // float32 3.65
        )

        val decoded = CborCodec.decode(encoded) as Map<*, *>

        assertEquals(3.65f, decoded["x"] as Float, 0.0f)
    }

    @Test
    fun `decodes a float16 map value`() {
        val encoded = bytes(
            0xa1,
            0x61, 0x78, // "x"
            0xf9, 0x3c, 0x00, // float16 1.0
        )

        val decoded = CborCodec.decode(encoded) as Map<*, *>

        assertEquals(1.0f, decoded["x"] as Float, 0.0f)
    }

    @Test
    fun `decodes simple values without consuming the following element`() {
        // [null, true, false, 1]
        val encoded = bytes(0x84, 0xf6, 0xf5, 0xf4, 0x01)

        val decoded = CborCodec.decode(encoded) as List<*>

        assertEquals(4, decoded.size)
        assertEquals(null, decoded[0])
        assertEquals(true, decoded[1])
        assertEquals(false, decoded[2])
        assertEquals(1L, decoded[3])
    }

    @Test
    fun `decodes a tag 24 issued signed item holding a float`() {
        // Mirrors CredentialRegistry.buildCredentialEntry: the IssuerSigned item
        // is a #6.24-wrapped byte string containing {elementIdentifier, elementValue}.
        val itemMap = mapOf<String, Any?>(
            "digestID" to 0L,
            "elementIdentifier" to "gpa",
            "elementValue" to CborRaw(bytes(0xfb, 0x40, 0x0d, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33)),
        )
        val itemBytes = CborCodec.encode(itemMap)
        val wrapped = CborCodec.encode(CborTagged(24, itemBytes))

        val tag = CborCodec.decode(wrapped) as CborTagged
        assertEquals(24L, tag.number)

        @Suppress("UNCHECKED_CAST")
        val inner = CborCodec.decode(tag.value as ByteArray) as Map<String, Any?>

        assertEquals("gpa", inner["elementIdentifier"])
        assertEquals(3.65, inner["elementValue"] as Double, 0.0)
    }

    @Test
    fun `round trips a mixed map`() {
        val original = mapOf<String, Any?>(
            "student_id" to "SA-1D370F8E",
            "total_credits" to 12L,
            "gpa" to 3.65,
            "completed" to true,
            "notes" to null,
            "tags" to listOf("a", "b"),
        )

        val decoded = CborCodec.decode(CborCodec.encode(original)) as Map<*, *>

        assertEquals("SA-1D370F8E", decoded["student_id"])
        assertEquals(12L, decoded["total_credits"])
        assertEquals(3.65, decoded["gpa"] as Double, 0.0)
        assertEquals(true, decoded["completed"])
        assertEquals(null, decoded["notes"])
        assertEquals(listOf("a", "b"), decoded["tags"])
    }

    @Test
    fun `rejects truncated input`() {
        val failure = runCatching { CborCodec.decode(bytes(0xa1)) }.exceptionOrNull()

        assertTrue(
            "expected an IllegalArgumentException, got $failure",
            failure is IllegalArgumentException,
        )
    }

    @Test
    fun `rejects indefinite length items`() {
        // 0x1f is reserved for indefinite-length byte strings, which are not valid
        // inside a canonical mdoc.
        val failure = runCatching { CborCodec.decode(bytes(0x5f)) }.exceptionOrNull()

        assertTrue(
            "expected an IllegalArgumentException, got $failure",
            failure is IllegalArgumentException,
        )
    }
}
