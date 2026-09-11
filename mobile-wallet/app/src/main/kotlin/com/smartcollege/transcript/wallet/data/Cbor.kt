package com.smartcollege.transcript.wallet.data

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import kotlin.math.pow

/** A raw CBOR fragment spliced verbatim into the encoder output. */
class CborRaw(val bytes: ByteArray)

/** A CBOR tag (major type 6) with a numeric tag number and its value. */
class CborTagged(val number: Long, val value: Any?)

/**
 * Minimal canonical RFC 8949 CBOR encoder/decoder used by the wallet's
 * org-iso-mdoc presentment path. Values are represented with plain Kotlin
 * types: [Map] for maps, [List] for arrays, [ByteArray] for byte strings,
 * [String] for text strings, [Long] for integers, [Boolean]/`null` for simple
 * values, [CborTagged] for tags, and [CborRaw] for pre-encoded fragments.
 */
object CborCodec {

    fun encode(value: Any?): ByteArray = ByteArrayOutputStream().also { write(it, value) }.toByteArray()

    private fun write(out: ByteArrayOutputStream, value: Any?) {
        when (value) {
            null -> out.write(0xf6)
            is CborRaw -> out.write(value.bytes)
            is CborTagged -> {
                writeHead(out, 6, value.number)
                write(out, value.value)
            }
            is Boolean -> out.write(if (value) 0xf5 else 0xf4)
            is Long -> {
                if (value >= 0) {
                    writeHead(out, 0, value)
                } else {
                    writeHead(out, 1, -1L - value)
                }
            }
            is Int -> write(out, value.toLong())
            is String -> {
                val bytes = value.toByteArray(Charsets.UTF_8)
                writeHead(out, 3, bytes.size.toLong())
                out.write(bytes)
            }
            is ByteArray -> {
                writeHead(out, 2, value.size.toLong())
                out.write(value)
            }
            is List<*> -> {
                writeHead(out, 4, value.size.toLong())
                for (item in value) write(out, item)
            }
            is Map<*, *> -> {
                writeHead(out, 5, value.size.toLong())
                for ((k, v) in value) {
                    write(out, k)
                    write(out, v)
                }
            }
            is Double -> {
                out.write(0xfb)
                val bytes = ByteBuffer.allocate(8).putDouble(value).array()
                out.write(bytes)
            }
            else -> error("Unsupported CBOR value type: ${value::class}")
        }
    }

    private fun writeHead(out: ByteArrayOutputStream, major: Int, value: Long) {
        val initial = (major shl 5)
        when {
            value < 24 -> out.write(initial or value.toInt())
            value < 256 -> {
                out.write(initial or 24)
                out.write(value.toInt())
            }
            value < 65536 -> {
                out.write(initial or 25)
                out.write((value ushr 8).toInt())
                out.write(value.toInt())
            }
            value < 4294967296L -> {
                out.write(initial or 26)
                out.write((value ushr 24).toInt())
                out.write((value ushr 16).toInt())
                out.write((value ushr 8).toInt())
                out.write(value.toInt())
            }
            else -> {
                out.write(initial or 27)
                out.write((value ushr 56).toInt())
                out.write((value ushr 48).toInt())
                out.write((value ushr 40).toInt())
                out.write((value ushr 32).toInt())
                out.write((value ushr 24).toInt())
                out.write((value ushr 16).toInt())
                out.write((value ushr 8).toInt())
                out.write(value.toInt())
            }
        }
    }

    fun decode(bytes: ByteArray): Any? = Decoder(bytes).read()

    private class Decoder(private val bytes: ByteArray) {
        private var offset = 0

        fun read(): Any? {
            val initial = nextByte()
            val major = initial ushr 5
            val additional = initial and 0x1f
            // Major type 7 (floats and simple values) carries its payload in the
            // additional-information bits, so it must not go through readLength:
            // doing so consumed the float bytes here and then again in readSimple,
            // desynchronising the decoder and throwing "Unexpected end of CBOR"
            // for any element whose value is a float (e.g. a numeric gpa).
            if (major == 7) return readSimple(additional)
            val length = readLength(additional)
            return when (major) {
                0 -> length
                1 -> -1L - length
                2 -> bytes.copyOfRange(offset, offset + length.toInt()).also { offset += length.toInt() }
                3 -> bytes.copyOfRange(offset, offset + length.toInt()).also { offset += length.toInt() }
                    .toString(Charsets.UTF_8)
                4 -> List(length.toInt()) { read() }
                5 -> LinkedHashMap<Any?, Any?>().also { map ->
                    repeat(length.toInt()) { map[read()] = read() }
                }
                6 -> CborTagged(length, read())
                else -> throw IllegalArgumentException("Unsupported CBOR major type $major")
            }
        }

        private fun readSimple(additional: Int): Any? = when (additional) {
            20 -> false
            21 -> true
            22, 23 -> null
            24 -> nextByte()
            25 -> float16(readUnsigned(2).toInt())
            26 -> Float.fromBits(readUnsigned(4).toInt())
            27 -> Double.fromBits(readUnsigned(8))
            else -> throw IllegalArgumentException("Unsupported simple value $additional")
        }

        /** IEEE 754 half-precision (major type 7, additional information 25). */
        private fun float16(bits: Int): Float {
            val sign = bits and 0x8000
            val exponent = (bits ushr 10) and 0x1f
            val mantissa = bits and 0x03ff
            val magnitude = when (exponent) {
                0 -> mantissa * 2.0.pow(-24)
                31 -> if (mantissa == 0) Double.POSITIVE_INFINITY else Double.NaN
                else -> (mantissa + 1024) * 2.0.pow(exponent - 25)
            }
            return (if (sign != 0) -magnitude else magnitude).toFloat()
        }

        private fun readLength(additional: Int): Long = when (additional) {
            in 0..23 -> additional.toLong()
            24 -> nextByte().toLong()
            25 -> readUnsigned(2)
            26 -> readUnsigned(4)
            27 -> readUnsigned(8)
            else -> throw IllegalArgumentException("Indefinite-length CBOR is not supported")
        }

        private fun readUnsigned(size: Int): Long {
            require(offset + size <= bytes.size) { "Unexpected end of CBOR" }
            var value = 0L
            repeat(size) {
                value = (value shl 8) or (bytes[offset++].toLong() and 0xff)
            }
            return value
        }

        private fun nextByte(): Int {
            require(offset < bytes.size) { "Unexpected end of CBOR" }
            return bytes[offset++].toInt() and 0xff
        }
    }
}
