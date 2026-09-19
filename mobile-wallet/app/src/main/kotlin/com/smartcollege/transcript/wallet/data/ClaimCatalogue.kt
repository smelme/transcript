package com.smartcollege.transcript.wallet.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/** One claim, worded for the person the credential is about. */
data class Claim(val label: String, val value: String, val detail: String? = null)

/**
 * A block of claims: which part of the document it is, what it is called, and what it holds.
 *
 * The id is stable across credentials, so a screen can keep a block's open or closed state on it
 * rather than on a title whose wording may change.
 */
data class ClaimGroup(val id: String, val title: String, val claims: List<Claim>)

/**
 * How the claims of a stored credential are grouped and named for their holder.
 *
 * A holder is owed the whole of their own credential, so every element the issuer signed is
 * shown - including the ones this wallet has no words for, which are named from their own
 * identifier, and in a namespace it does not recognise, which still gets its own block.
 *
 * The grouping follows what a claim is about rather than the namespace it is signed in: the
 * photo-ID namespace carries the holder's identity and the document's own issue facts side by
 * side, and a reader looking for their name is not looking for an issuing-country code.
 */
object ClaimCatalogue {

    /** The blocks this wallet knows. A namespace it does not know is its own block, id and all. */
    const val SECTION_IDENTITY = "identity"
    const val SECTION_CREDENTIAL = "credential"
    const val SECTION_QUALIFICATION = "qualification"
    const val SECTION_STUDY = "study"
    const val SECTION_RECORD = "record"
    const val SECTION_COURSES = "courses"

    private const val PORTRAIT = "portrait"

    /** Who the credential is about, as opposed to the document that carries it. */
    private val identityElements = setOf(
        "family_name",
        "given_name",
        "birth_date",
        "portrait",
        "place_of_birth",
        "nationality",
        "sex",
    )

    private val knownNamespaces = setOf(
        AcademicNamespaces.PHOTO_ID,
        AcademicNamespaces.QUALIFICATION,
        AcademicNamespaces.TRANSCRIPT,
        AcademicNamespaces.ACADEMIC_RECORD,
    )

    private val labels = mapOf(
        // Identity
        "given_name" to "Given name",
        "family_name" to "Family name",
        "birth_date" to "Date of birth",
        "place_of_birth" to "Place of birth",
        "nationality" to "Nationality",
        "sex" to "Sex",
        "portrait" to "Photograph",
        // The document that carries the identity
        "issuing_authority" to "Issuing authority",
        "issuing_country" to "Issuing country",
        "issue_date" to "Issued",
        "expiry_date" to "Expires",
        "document_number" to "Document number",
        "un_distinguishing_sign" to "Distinguishing sign",
        // The award
        "institution_name" to "Institution",
        "programme_title" to "Programme",
        "award_title" to "Award",
        "degree_level" to "Degree level",
        "field_of_study" to "Field of study",
        "graduation_date" to "Graduation date",
        "award_date" to "Award date",
        "recognition" to "Recognition",
        // The study
        "student_id" to "Student ID",
        "courses" to "Courses",
        "total_credits" to "Total credits",
        "credits_attempted" to "Credits attempted",
        "credits_earned" to "Credits earned",
        "quality_points" to "Quality points",
        "gpa" to "Grade point average",
        "mark_scale_id" to "Grading scale",
        "status" to "Status",
    )

    /**
     * The blocks to show for one credential, in reading order. An element with no value is left
     * out rather than shown as "not recorded": a claim the issuer did not sign is not a claim
     * with a missing value.
     */
    fun groupsOf(namespaces: Map<String, Map<String, Any?>>): List<ClaimGroup> {
        val groups = mutableListOf<ClaimGroup>()
        val photoId = namespaces[AcademicNamespaces.PHOTO_ID].orEmpty()
        if (photoId.isNotEmpty()) {
            groups += block(SECTION_IDENTITY, "Identity", photoId.filterKeys { it in identityElements })
            groups += block(
                SECTION_CREDENTIAL,
                "Credential",
                photoId.filterKeys { it !in identityElements },
            )
        }
        groups += block(
            SECTION_QUALIFICATION,
            "Qualification",
            namespaces[AcademicNamespaces.QUALIFICATION].orEmpty(),
        )
        // The course list is opened into its own block, so the study block keeps the figures.
        groups += block(
            SECTION_STUDY,
            "Study",
            namespaces[AcademicNamespaces.TRANSCRIPT].orEmpty().filterKeys { it != SECTION_COURSES },
        )
        groups += block(
            SECTION_RECORD,
            "Academic record",
            namespaces[AcademicNamespaces.ACADEMIC_RECORD].orEmpty(),
        )
        groups += courseBlock(namespaces[AcademicNamespaces.TRANSCRIPT].orEmpty())
        // A namespace this wallet has never heard of is still the holder's own claim. It keeps its
        // own name as its id, which is as stable as anything this wallet could invent for it.
        for ((namespace, elements) in namespaces) {
            if (namespace in knownNamespaces) continue
            groups += block(namespace, titleFor(namespace), elements)
        }
        return groups.filter { it.claims.isNotEmpty() }
    }

    /**
     * One line saying what a block is about, for the row that is collapsed.
     *
     * The order is what a holder looks for first in that part of a document - their name, when the
     * document was issued, what was awarded - and the first claim is the fallback, so a block this
     * wallet has no opinion about still says something true about itself.
     */
    fun headlineFor(group: ClaimGroup): String? {
        // The course block counts its courses in its own title, and its first course says nothing
        // about the other eleven.
        if (group.id == SECTION_COURSES) return null
        // Each entry is one way of saying what the block is about, tried in order: the first that
        // the credential can answer wins, and a name is the one thing worth saying twice.
        val preferred = when (group.id) {
            SECTION_IDENTITY -> listOf(listOf("Given name", "Family name"))
            SECTION_CREDENTIAL -> listOf(
                listOf("Issued"),
                listOf("Document number"),
                listOf("Issuing authority"),
            )
            SECTION_QUALIFICATION -> listOf(
                listOf("Award"),
                listOf("Programme"),
                listOf("Degree level"),
            )
            SECTION_STUDY -> listOf(
                listOf("Status"),
                listOf("Grade point average"),
                listOf("Total credits"),
            )
            else -> emptyList()
        }
        for (candidate in preferred) {
            val values = candidate.mapNotNull { label ->
                group.claims.firstOrNull { it.label == label }?.value
            }
            if (values.isNotEmpty()) return values.joinToString(" ")
        }
        return group.claims.firstOrNull()?.value
    }

    /** The label for an element identifier, for a reader rather than for a protocol. */
    fun labelFor(identifier: String): String = labels[identifier] ?: humanise(identifier)

    /** A value as text, or null when there is nothing to show. */
    fun format(value: Any?): String? = when (value) {
        null -> null
        is String -> value.trim().takeIf { it.isNotEmpty() }
        is Boolean -> if (value) "Yes" else "No"
        is ByteArray -> "${value.size} bytes"
        // CBOR writes a number at whatever width it was written, so 27 is shown as 27 and not
        // as 27.0 merely because it arrived as a double.
        is Double -> if (value == value.toLong().toDouble()) {
            value.toLong().toString()
        } else {
            value.toString()
        }
        is Number -> value.toString()
        is List<*> -> value.mapNotNull { format(it) }.takeIf { it.isNotEmpty() }?.joinToString(", ")
        is Map<*, *> -> value.entries
            .mapNotNull { (key, item) -> format(item)?.let { "$key: $it" } }
            .takeIf { it.isNotEmpty() }
            ?.joinToString(", ")
        else -> value.toString().trim().takeIf { it.isNotEmpty() }
    }

    private fun block(id: String, title: String, elements: Map<String, Any?>): ClaimGroup =
        ClaimGroup(id, title, elements.mapNotNull { (identifier, value) -> claim(identifier, value) })

    private fun claim(identifier: String, value: Any?): Claim? {
        // A portrait is a claim like any other, but its bytes are not what a holder reads.
        if (identifier == PORTRAIT && value is ByteArray) {
            return Claim(labelFor(identifier), "Photograph on file")
        }
        val text = format(value) ?: return null
        return Claim(labelFor(identifier), text)
    }

    /**
     * The course list travels as a single JSON string claim, so it is opened here and shown as
     * the rows a holder recognises. A list this wallet cannot read stays visible as it was
     * signed rather than quietly disappearing.
     */
    private fun courseBlock(transcript: Map<String, Any?>): ClaimGroup {
        val raw = transcript[SECTION_COURSES] ?: return ClaimGroup(SECTION_COURSES, "Courses", emptyList())
        val courses = parseCourses(raw)
        // The count is in the title, so a holder can see how much study there is without opening
        // the block - which is the one block that can run to a dozen rows.
        if (courses.isNotEmpty()) return ClaimGroup(SECTION_COURSES, "Courses (${courses.size})", courses)
        return ClaimGroup(
            SECTION_COURSES,
            "Courses",
            listOfNotNull(claim(SECTION_COURSES, raw)),
        )
    }

    private fun parseCourses(value: Any?): List<Claim> {
        val json = value as? String ?: return emptyList()
        val array = runCatching { Json.parseToJsonElement(json) }.getOrNull() as? JsonArray
            ?: return emptyList()
        return array.mapNotNull { element ->
            val course = element as? JsonObject ?: return@mapNotNull null
            val name = text(course, "courseName") ?: text(course, "courseCode") ?: return@mapNotNull null
            val outcome = text(course, "outcome")
            val detail = listOfNotNull(
                text(course, "courseCode"),
                text(course, "term"),
                text(course, "credits")?.let { "$it credits" },
                text(course, "gradePoints")?.let { "$it quality points" },
                // A mark below the pass mark is the one thing about a course its holder must not
                // have to infer from the grade.
                outcome?.takeIf { it != "passed" },
            ).joinToString(" · ")
            Claim(name, text(course, "grade") ?: "Not recorded", detail.ifBlank { null })
        }
    }

    private fun text(course: JsonObject, key: String): String? =
        (course[key] as? JsonPrimitive)?.contentOrNull?.takeIf { it.isNotBlank() }

    /**
     * What to call a namespace when a disclosure is shown back to the holder. It is named here
     * rather than inferred from the elements, because a log records what was asked for one
     * namespace at a time and a request may name only one of the two halves of a namespace.
     */
    fun sectionTitleFor(namespace: String): String = when (namespace) {
        AcademicNamespaces.PHOTO_ID -> "Identity and document"
        AcademicNamespaces.QUALIFICATION -> "Qualification"
        AcademicNamespaces.TRANSCRIPT -> "Study"
        AcademicNamespaces.ACADEMIC_RECORD -> "Academic record"
        else -> titleFor(namespace)
    }

    /**
     * The block for a namespace this wallet does not know: named from the namespace itself, and
     * from the last part of it that is a name rather than the version number every namespace
     * ends with - "org.example.education.internship.1" is an internship, not a "1".
     */
    private fun titleFor(namespace: String): String {
        val name = namespace
            .split('.')
            .lastOrNull { segment -> segment.isNotBlank() && segment.any { !it.isDigit() } }
            ?: namespace
        return humanise(name)
    }

    /** "issue_date" reads as "Issue date", and "academic-record" as "Academic record". */
    private fun humanise(identifier: String): String {
        val words = identifier.replace('_', ' ').replace('-', ' ').trim()
        if (words.isEmpty()) return identifier
        return words.replaceFirstChar { it.uppercaseChar() }
    }
}
