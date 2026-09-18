package com.smartcollege.transcript.wallet.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a holder sees of their own credential: every claim, grouped by what it is about.
 *
 * The property that matters here is completeness. A credential the holder cannot read in full
 * is one they cannot check, so nothing an issuer signed may be dropped merely because this
 * wallet has no special case for it.
 */
class ClaimCatalogueTest {

    private fun photoId(): Map<String, Any?> = linkedMapOf(
        "given_name" to "Tessa",
        "family_name" to "Novak",
        "birth_date" to "2003-04-11",
        "portrait" to ByteArray(64),
        "issuing_authority" to "Smart Academy",
        "issue_date" to "2026-09-18",
    )

    private fun qualification(): Map<String, Any?> = linkedMapOf(
        "institution_name" to "Smart Academy",
        "programme_title" to "Bachelor of Psychology",
        "award_title" to "Bachelor of Arts",
        "degree_level" to "Bachelor",
        "field_of_study" to "Psychology",
        "graduation_date" to "2026-06-30",
    )

    private fun transcript(): Map<String, Any?> = linkedMapOf(
        "student_id" to "SA-1",
        "total_credits" to 27L,
        "gpa" to 3.5,
        "courses" to """
            [
              {"courseCode":"PSY101","courseName":"Introduction to Psychology","credits":3,
               "grade":"A-","gradePoints":11.1,"outcome":"passed","term":"Fall 2024",
               "termStart":"2024-09-01","termEnd":"2024-12-15"},
              {"courseCode":"PSY210","courseName":"Research Methods","credits":6,
               "grade":"B","gradePoints":18.0,"outcome":"passed","term":"Spring 2025"}
            ]
        """.trimIndent(),
    )

    private fun combined(): Map<String, Map<String, Any?>> = linkedMapOf(
        AcademicNamespaces.PHOTO_ID to photoId(),
        AcademicNamespaces.QUALIFICATION to qualification(),
        AcademicNamespaces.TRANSCRIPT to transcript(),
    )

    private fun titles(groups: List<ClaimGroup>): List<String> = groups.map { it.title }

    private fun claimOf(groups: List<ClaimGroup>, title: String, label: String): Claim? =
        groups.firstOrNull { it.title == title }?.claims?.firstOrNull { it.label == label }

    @Test
    fun `a credential is grouped by what its claims are about`() {
        val groups = ClaimCatalogue.groupsOf(combined())

        assertEquals(
            listOf("Identity", "Credential", "Qualification", "Study", "Courses (2)"),
            titles(groups),
        )
        // The photo-ID namespace carries both, so the grouping cannot be the namespace.
        assertEquals("Tessa", claimOf(groups, "Identity", "Given name")?.value)
        assertEquals("Smart Academy", claimOf(groups, "Credential", "Issuing authority")?.value)
        assertEquals("2026-09-18", claimOf(groups, "Credential", "Issued")?.value)
        assertEquals("Bachelor of Arts", claimOf(groups, "Qualification", "Award")?.value)
    }

    @Test
    fun `nothing the issuer signed is left out`() {
        val signed = (photoId().keys + qualification().keys + transcript().keys).size
        val shown = ClaimCatalogue.groupsOf(combined()).sumOf { it.claims.size }

        // Every element is shown, and the course list becomes one row per course rather than
        // one row for the list.
        assertEquals(signed - 1 + 2, shown)
    }

    @Test
    fun `an element the wallet has no words for is still shown`() {
        val namespaces = mapOf<String, Map<String, Any?>>(
            AcademicNamespaces.TRANSCRIPT to linkedMapOf("some_new_element" to "recorded"),
        )

        val claim = claimOf(ClaimCatalogue.groupsOf(namespaces), "Study", "Some new element")
        assertEquals("recorded", claim?.value)
    }

    @Test
    fun `a namespace the wallet does not know gets its own block`() {
        val groups = ClaimCatalogue.groupsOf(
            mapOf(
                AcademicNamespaces.PHOTO_ID to photoId(),
                "org.example.education.internship.1" to linkedMapOf("placement_hours" to 240L),
            )
        )

        assertEquals("Internship", groups.last().title)
        assertEquals("240", groups.last().claims.single().value)
    }

    @Test
    fun `the course list is opened into rows a holder recognises`() {
        val groups = ClaimCatalogue.groupsOf(combined())
        val course = claimOf(groups, "Courses (2)", "Introduction to Psychology")

        assertEquals("A-", course?.value)
        assertEquals(
            "PSY101 · Fall 2024 · 3 credits · 11.1 quality points",
            course?.detail,
        )
        assertFalse(
            "the study block does not repeat the course list",
            groups.first { it.title == "Study" }.claims.any { it.label == "Courses" },
        )
    }

    @Test
    fun `a failed course says so rather than leaving it to the grade`() {
        val namespaces = mapOf<String, Map<String, Any?>>(
            AcademicNamespaces.TRANSCRIPT to linkedMapOf(
                "courses" to """[{"courseCode":"PSY310","courseName":"Statistics","credits":3,"grade":"D","outcome":"failed"}]""",
            ),
        )

        val course = ClaimCatalogue.groupsOf(namespaces).single().claims.single()
        assertEquals("D", course.value)
        assertTrue("the outcome is stated", course.detail?.contains("failed") == true)
    }

    @Test
    fun `an element with no value is left out, not shown as missing`() {
        val namespaces = mapOf<String, Map<String, Any?>>(
            AcademicNamespaces.QUALIFICATION to linkedMapOf(
                "institution_name" to "Smart Academy",
                "graduation_date" to null,
                "field_of_study" to "   ",
            ),
        )

        assertEquals(
            listOf("Institution"),
            ClaimCatalogue.groupsOf(namespaces).single().claims.map { it.label },
        )
    }

    @Test
    fun `numbers are shown at the width they were written`() {
        assertEquals("27", ClaimCatalogue.format(27L))
        assertEquals("27", ClaimCatalogue.format(27.0))
        assertEquals("3.5", ClaimCatalogue.format(3.5))
        assertEquals("Yes", ClaimCatalogue.format(true))
    }

    @Test
    fun `a portrait is described rather than dumped as bytes`() {
        val claim = claimOf(ClaimCatalogue.groupsOf(combined()), "Identity", "Photograph")
        assertEquals("Photograph on file", claim?.value)
    }
}
