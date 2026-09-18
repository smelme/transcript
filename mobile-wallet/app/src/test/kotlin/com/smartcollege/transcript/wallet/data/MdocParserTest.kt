package com.smartcollege.transcript.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which kind a stored credential is, and what the holder can see about it.
 *
 * Both kinds are issued under the photo-ID docType, so the academic namespace a credential
 * holds is the only thing that tells them apart - and it is also what a relying party asks
 * for, so it decides eligibility too.
 */
class MdocParserTest {

    private fun item(identifier: String, valueCbor: ByteArray) = CborTagged(
        24,
        CborCodec.encode(
            mapOf<String, Any?>(
                "digestID" to 0L,
                "random" to ByteArray(16),
                "elementIdentifier" to identifier,
                "elementValue" to CborRaw(valueCbor),
            )
        ),
    )

    private fun mdoc(namespaces: Map<String, List<CborTagged>>): String =
        CryptoUtil.base64UrlEncode(
            CborCodec.encode(
                mapOf<String, Any?>(
                    "docType" to AcademicNamespaces.PHOTO_ID,
                    "nameSpaces" to namespaces,
                )
            )
        )

    private fun photoId() = listOf(
        item("given_name", CborCodec.encode("Tessa")),
        item("family_name", CborCodec.encode("Novak")),
        item("issuing_authority", CborCodec.encode("Smart Academy")),
        // The identity document carries the day the credential was signed, which is what the
        // card means by "Issued" - it is not the day the study ended.
        item("issue_date", CborCodec.encode("2026-09-13")),
    )

    @Test
    fun `reads every namespace in the document, in the order it was signed`() {
        val namespaces = MdocParser.readNamespaces(
            mdoc(
                linkedMapOf(
                    AcademicNamespaces.PHOTO_ID to photoId(),
                    AcademicNamespaces.QUALIFICATION to listOf(
                        item("award_title", CborCodec.encode("Bachelor of Arts")),
                        item("total_credits", byteArrayOf(0x18, 0x1b)), // uint 27
                    ),
                )
            )
        )

        // The holder's own screen shows the document as it was signed, so nothing may be lost on
        // the way through the parser.
        assertEquals(
            listOf(AcademicNamespaces.PHOTO_ID, AcademicNamespaces.QUALIFICATION),
            namespaces.keys.toList(),
        )
        assertEquals("Tessa", namespaces.getValue(AcademicNamespaces.PHOTO_ID)["given_name"])
        assertEquals(
            "Bachelor of Arts",
            namespaces.getValue(AcademicNamespaces.QUALIFICATION)["award_title"],
        )
        assertEquals(27L, namespaces.getValue(AcademicNamespaces.QUALIFICATION)["total_credits"])
    }

    @Test
    fun `a document that cannot be read yields no claims rather than failing`() {
        assertEquals(emptyMap<String, Map<String, Any?>>(), MdocParser.readNamespaces("not-cbor"))
    }

    @Test
    fun `reads a transcript as a transcript, with the figures it holds`() {
        val summary = MdocParser.readCredentialSummary(
            mdoc(
                linkedMapOf(
                    AcademicNamespaces.PHOTO_ID to photoId(),
                    AcademicNamespaces.TRANSCRIPT to listOf(
                        item("student_id", CborCodec.encode("SA-1")),
                        item("total_credits", byteArrayOf(0x18, 0x1b)), // uint 27
                        item(
                            "courses",
                            CborCodec.encode("""[{"courseCode":"CS101"},{"courseCode":"CS210"},{"courseCode":"MA110"}]"""),
                        ),
                        item("status", CborCodec.encode("completed")),
                        // A transcript is issued on its own, so it states which qualification the
                        // study was for rather than leaving the holder to guess.
                        item("programme_title", CborCodec.encode("Bachelor of Psychology")),
                        item("award_title", CborCodec.encode("Bachelor of Arts")),
                    ),
                )
            )
        )

        assertEquals(AcademicNamespaces.KIND_TRANSCRIPT, summary?.kind)
        assertEquals("Tessa Novak", summary?.fullName)
        assertEquals("Smart Academy", summary?.institution)
        assertEquals(3, summary?.courseCount ?: -1)
        assertEquals(27, summary?.totalCredits ?: -1)
        assertEquals("completed", summary?.completionStatus)
        assertEquals(
            "the transcript names the qualification it belongs to",
            "Bachelor of Psychology",
            summary?.programmeTitle,
        )
        assertEquals("Bachelor of Arts", summary?.awardTitle)
        assertEquals(
            "the issue date comes from the document, not from the graduation",
            "2026-09-13",
            summary?.issueDate,
        )
        assertEquals("a transcript carries no award fields", "", summary?.degreeLevel)
    }

    @Test
    fun `reads a qualification as a qualification, with its award`() {
        val summary = MdocParser.readCredentialSummary(
            mdoc(
                linkedMapOf(
                    AcademicNamespaces.PHOTO_ID to photoId(),
                    AcademicNamespaces.QUALIFICATION to listOf(
                        item("institution_name", CborCodec.encode("Smart Academy")),
                        item("degree_level", CborCodec.encode("Master")),
                        item("field_of_study", CborCodec.encode("Data Science")),
                        item("graduation_date", CborCodec.encode("2025-06-30")),
                        item("programme_title", CborCodec.encode("Master of Data Science")),
                        item("award_title", CborCodec.encode("Master of Science")),
                    ),
                )
            )
        )

        assertEquals(AcademicNamespaces.KIND_QUALIFICATION, summary?.kind)
        assertEquals("Master", summary?.degreeLevel)
        assertEquals("Data Science", summary?.fieldOfStudy)
        assertEquals("2025-06-30", summary?.graduationDate)
        assertEquals("Master of Data Science", summary?.programmeTitle)
        assertEquals("Master of Science", summary?.awardTitle)
        assertEquals("a qualification carries no course list", 0, summary?.courseCount ?: -1)
        assertEquals(0, summary?.totalCredits ?: -1)
    }

    @Test
    fun `a credential holding both namespaces is read as both`() {
        val summary = MdocParser.readCredentialSummary(
            mdoc(
                linkedMapOf(
                    AcademicNamespaces.PHOTO_ID to photoId(),
                    AcademicNamespaces.QUALIFICATION to listOf(
                        item("degree_level", CborCodec.encode("Bachelor")),
                    ),
                    AcademicNamespaces.TRANSCRIPT to listOf(
                        item("total_credits", byteArrayOf(0x18, 0x78)), // uint 120
                    ),
                )
            )
        )

        assertEquals(AcademicNamespaces.KIND_BOTH, summary?.kind)
        assertEquals("Bachelor", summary?.degreeLevel)
        assertEquals(120, summary?.totalCredits ?: -1)
    }

    @Test
    fun `a credential with no academic namespace is not given a kind`() {
        val summary = MdocParser.readCredentialSummary(
            mdoc(linkedMapOf(AcademicNamespaces.PHOTO_ID to photoId()))
        )

        assertEquals(AcademicNamespaces.KIND_UNKNOWN, summary?.kind)
        assertFalse(
            "it must not be attributed to either academic kind",
            summary?.kind == AcademicNamespaces.KIND_QUALIFICATION ||
                summary?.kind == AcademicNamespaces.KIND_TRANSCRIPT,
        )
    }

    @Test
    fun `a course list that is not readable counts as no courses`() {
        val summary = MdocParser.readCredentialSummary(
            mdoc(
                linkedMapOf(
                    AcademicNamespaces.PHOTO_ID to photoId(),
                    AcademicNamespaces.TRANSCRIPT to listOf(
                        item("courses", CborCodec.encode("not json")),
                    ),
                )
            )
        )

        assertEquals(0, summary?.courseCount ?: -1)
        assertEquals(
            "an unreadable course list does not change what the credential is",
            AcademicNamespaces.KIND_TRANSCRIPT,
            summary?.kind,
        )
    }

    @Test
    fun `an unreadable mdoc yields no summary rather than a wrong one`() {
        assertNull(MdocParser.readCredentialSummary("not-base64url-at-all"))
    }
}

/** The rule a request is matched against, kept free of Android so it can be tested here. */
class PresentationEligibilityTest {

    private val transcriptOnly = setOf(AcademicNamespaces.TRANSCRIPT)
    private val qualificationOnly = setOf(AcademicNamespaces.QUALIFICATION)

    @Test
    fun `a transcript request is answered only by a transcript`() {
        assertTrue(PresentationEligibility.satisfies(AcademicNamespaces.KIND_TRANSCRIPT, transcriptOnly))
        assertFalse(
            "presenting a qualification would disclose nothing the relying party asked for",
            PresentationEligibility.satisfies(AcademicNamespaces.KIND_QUALIFICATION, transcriptOnly),
        )
    }

    @Test
    fun `a qualification request is answered only by a qualification`() {
        assertTrue(PresentationEligibility.satisfies(AcademicNamespaces.KIND_QUALIFICATION, qualificationOnly))
        assertFalse(PresentationEligibility.satisfies(AcademicNamespaces.KIND_TRANSCRIPT, qualificationOnly))
    }

    @Test
    fun `a credential holding both can answer either request`() {
        assertTrue(PresentationEligibility.satisfies(AcademicNamespaces.KIND_BOTH, transcriptOnly))
        assertTrue(PresentationEligibility.satisfies(AcademicNamespaces.KIND_BOTH, qualificationOnly))
    }

    @Test
    fun `a request for both namespaces is answered only by a credential holding both`() {
        val both = setOf(AcademicNamespaces.QUALIFICATION, AcademicNamespaces.TRANSCRIPT)
        assertTrue(PresentationEligibility.satisfies(AcademicNamespaces.KIND_BOTH, both))
        assertFalse(PresentationEligibility.satisfies(AcademicNamespaces.KIND_TRANSCRIPT, both))
        assertFalse(PresentationEligibility.satisfies(AcademicNamespaces.KIND_QUALIFICATION, both))
    }

    @Test
    fun `a credential with no academic namespace answers no academic request`() {
        assertFalse(PresentationEligibility.satisfies(AcademicNamespaces.KIND_UNKNOWN, transcriptOnly))
        assertTrue(
            "a request that names no namespaces constrains nothing",
            PresentationEligibility.satisfies(AcademicNamespaces.KIND_UNKNOWN, emptySet()),
        )
    }

    @Test
    fun `a transcript also answers a request for the academic-record supplement`() {
        val supplement = setOf(AcademicNamespaces.ACADEMIC_RECORD)
        assertTrue(PresentationEligibility.satisfies(AcademicNamespaces.KIND_TRANSCRIPT, supplement))
        assertTrue(PresentationEligibility.satisfies(AcademicNamespaces.KIND_BOTH, supplement))
        assertFalse(
            "a qualification holds no such namespace",
            PresentationEligibility.satisfies(AcademicNamespaces.KIND_QUALIFICATION, supplement),
        )
    }

    @Test
    fun `knows when nothing stored can answer the request`() {
        val kinds = listOf(AcademicNamespaces.KIND_QUALIFICATION, AcademicNamespaces.KIND_UNKNOWN)
        assertFalse(PresentationEligibility.anySatisfies(kinds, transcriptOnly))
        assertTrue(PresentationEligibility.anySatisfies(kinds, qualificationOnly))
        assertTrue(PresentationEligibility.anySatisfies(kinds, emptySet()))
    }
}
