package com.smartcollege.transcript.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Builds the entry the wallet publishes to Android Credential Manager from a
 * stored mdoc.
 *
 * Regression: the academy flow encodes a numeric `gpa` as a CBOR float64. The
 * decoder mis-read float payloads, so `buildCredentialEntry` threw and - because
 * the exception escaped the caller's `mapNotNull` - the entire registration was
 * abandoned, leaving the DCAPI credential chooser showing a stale set of
 * credentials. Today's credentials include every claim the older ones had, so a
 * matching rule that admits the old ones cannot be what excluded the new ones.
 */
class CredentialRegistryTest {

    private val photoIdNs = "org.iso.23220.photoid.1"
    private val qualificationNs = "org.iso.23220.education.qualification.1"
    private val transcriptNs = "org.iso.23220.education.transcript.1"

    /** `fb 400d333333333333` — exactly what the issuer's `new Cbor().f64(3.65)` emits. */
    private val gpa3_65 = byteArrayOf(
        0xfb.toByte(), 0x40, 0x0d, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
    )

    private fun item(identifier: String, valueCbor: ByteArray) = CborTagged(
        24,
        CborCodec.encode(
            mapOf<String, Any?>(
                "digestID" to 0L,
                "random" to ByteArray(16),
                "elementIdentifier" to identifier,
                // .raw(): the value is spliced in inline, as elementValueCbor.
                "elementValue" to CborRaw(valueCbor),
            )
        ),
    )

    /** An mdoc shaped like the issuer's output, including a float64 gpa. */
    private fun academicMdoc(): String = CryptoUtil.base64UrlEncode(
        CborCodec.encode(
            mapOf<String, Any?>(
                "docType" to "org.iso.23220.photoid.1",
                "nameSpaces" to linkedMapOf<String, Any?>(
                    photoIdNs to listOf(
                        item("given_name", CborCodec.encode("Samuel")),
                        item("family_name", CborCodec.encode("Melese")),
                    ),
                    qualificationNs to listOf(
                        item("institution_name", CborCodec.encode("Smart Academy")),
                        item("degree_level", CborCodec.encode("Master")),
                        item("gpa", gpa3_65),
                    ),
                    transcriptNs to listOf(
                        item("student_id", CborCodec.encode("SA-1D370F8E")),
                        item("total_credits", byteArrayOf(0x0c)), // uint 12
                    ),
                ),
            )
        )
    )

    @Suppress("UNCHECKED_CAST")
    private fun namespacesOf(entry: Map<String, Any?>): Map<String, Any?> =
        (entry["mdoc"] as Map<String, Any?>)["namespaces"] as Map<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun fieldsOf(namespaces: Map<String, Any?>, namespace: String): Map<String, Any?> =
        namespaces[namespace] as Map<String, Any?>

    @Test
    fun `builds an entry carrying every namespace, including the float gpa`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "5e5555ec-8e15-405c-8902-fd27fd96952d",
            mdocBase64Url = academicMdoc(),
            summary = CredentialSummary("Samuel Fikru Melese", "Smart Academy", "Master", "2025-06-30"),
        )

        val namespaces = namespacesOf(entry)

        // All three namespaces survived: nothing aborted part-way through.
        assertEquals(
            setOf(photoIdNs, qualificationNs, transcriptNs),
            namespaces.keys,
        )

        // The float claim is the one that used to break the parse.
        @Suppress("UNCHECKED_CAST")
        val gpa = fieldsOf(namespaces, qualificationNs)["gpa"] as List<String>
        // The label is the one the holder's own screen uses, so a claim reads the same wherever
        // they meet it.
        assertEquals(listOf("Grade point average", "3.65", "3.65"), gpa)

        assertEquals("Samuel", fieldsOf(namespaces, photoIdNs)["given_name"]?.let { (it as List<*>)[1] })
        assertEquals("Master", fieldsOf(namespaces, qualificationNs)["degree_level"]?.let { (it as List<*>)[1] })
        assertEquals("SA-1D370F8E", fieldsOf(namespaces, transcriptNs)["student_id"]?.let { (it as List<*>)[1] })
    }

    @Test
    fun `uses the summary for the chooser title and subtitle`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "6ab66df2-5fee-4481-9e76-7146beee511b",
            mdocBase64Url = academicMdoc(),
            summary = CredentialSummary(
                fullName = "Samuel Melese",
                institution = "Smart Academy",
                degreeLevel = "Master",
                graduationDate = "2025-06-30",
                kind = AcademicNamespaces.KIND_QUALIFICATION,
            ),
        )

        // The kind no longer titles the entry: one kind means it told the holder nothing.
        assertEquals("Samuel Melese", entry["title"])
        assertEquals("Smart Academy · Master · Graduated 2025-06-30", entry["subtitle"])
        assertEquals(
            "6ab66df2-5fee-4481-9e76-7146beee511b",
            (entry["mdoc"] as Map<*, *>)["documentId"],
        )
    }

    @Test
    fun `labels a transcript entry with the figures a transcript holds`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "8af0f2b1-0000-4000-8000-000000000001",
            mdocBase64Url = academicMdoc(),
            summary = CredentialSummary(
                fullName = "Tessa Novak",
                institution = "Smart Academy",
                kind = AcademicNamespaces.KIND_TRANSCRIPT,
                courseCount = 3,
                totalCredits = 24,
            ),
        )

        assertEquals("Tessa Novak", entry["title"])
        assertEquals(
            "a transcript credential holds no award date, so it is described by what it has",
            "Smart Academy · 3 courses · 24 credits",
            entry["subtitle"],
        )
    }

    @Test
    fun `names the qualification a transcript belongs to`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "8af0f2b1-0000-4000-8000-000000000003",
            mdocBase64Url = academicMdoc(),
            summary = CredentialSummary(
                fullName = "Tessa Novak",
                institution = "Smart Academy",
                kind = AcademicNamespaces.KIND_TRANSCRIPT,
                programmeTitle = "Bachelor of Psychology",
                awardTitle = "Bachelor of Arts",
                courseCount = 3,
                totalCredits = 24,
            ),
        )

        // Without this, two transcripts look identical in the wallet and the holder cannot tell
        // which qualification either one is for.
        assertEquals(
            "Smart Academy · Bachelor of Psychology · 3 courses · 24 credits",
            entry["subtitle"],
        )
    }

    @Test
    fun `falls back to the award when a transcript states no programme title`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "8af0f2b1-0000-4000-8000-000000000004",
            mdocBase64Url = academicMdoc(),
            summary = CredentialSummary(
                institution = "Smart Academy",
                kind = AcademicNamespaces.KIND_TRANSCRIPT,
                awardTitle = "Bachelor of Arts",
            ),
        )

        assertEquals("Smart Academy · Bachelor of Arts", entry["subtitle"])
    }

    @Test
    fun `describes a combined credential by its award and its study`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "8af0f2b1-0000-4000-8000-000000000005",
            mdocBase64Url = academicMdoc(),
            summary = CredentialSummary(
                fullName = "Tessa Novak",
                institution = "Smart Academy",
                kind = AcademicNamespaces.KIND_BOTH,
                programmeTitle = "Bachelor of Psychology",
                degreeLevel = "Bachelor",
                graduationDate = "2025-06-30",
                courseCount = 5,
                totalCredits = 24,
            ),
        )

        // One document holding both halves, so nothing is repeated and nothing is left out.
        assertEquals("Tessa Novak", entry["title"])
        assertEquals(
            "Smart Academy · Bachelor of Psychology · Graduated 2025-06-30 · 5 courses · 24 credits",
            entry["subtitle"],
        )
    }

    @Test
    fun `an unlabelled credential is shown as an academic credential`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "8af0f2b1-0000-4000-8000-000000000002",
            mdocBase64Url = academicMdoc(),
            summary = CredentialSummary(fullName = "Someone"),
        )

        assertEquals("Someone", entry["title"])
        assertEquals(
            "no institution and no kind is stated as such rather than guessed at",
            "Academic credential",
            entry["subtitle"],
        )
    }

    @Test
    fun `falls back to a generic entry when the mdoc is not a CBOR map`() {
        val entry = CredentialRegistry.buildCredentialEntry(
            credentialId = "broken",
            mdocBase64Url = CryptoUtil.base64UrlEncode(CborCodec.encode("not an mdoc")),
            summary = CredentialSummary("", "", "", ""),
        )

        assertEquals("Academic credential", entry["title"])
        assertTrue(namespacesOf(entry).isEmpty())
    }

    @Test
    fun `rejects input that is not base64url so the caller can skip that credential`() {
        val failure = runCatching {
            CredentialRegistry.buildCredentialEntry(
                credentialId = "broken",
                mdocBase64Url = "not-a-valid-credential",
                summary = CredentialSummary("", "", "", ""),
            )
        }.exceptionOrNull()

        assertTrue(
            "expected an IllegalArgumentException, got $failure",
            failure is IllegalArgumentException,
        )
    }
}
