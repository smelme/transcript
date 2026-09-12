# Transcript claims — gap analysis against common digitally-signed patterns

Question asked: what are common transcript patterns, particularly digitally signed ones, and
what are we missing from a claims point of view?

## Sources consulted

| Pattern | What it is | How it is signed |
|---|---|---|
| **ELMO / EMREX** (fetched: `github.com/emrex-eu/elmo-schemas`) | The European exchange format for result information, based on CEN **EN 15981-2011 EuroLMAI**: "a data model describing assessments, primarily Diplomas, Diploma Supplements and **Transcripts of Records** for higher education". This is the closest analogue to what we issue. | Enveloped **XML-DSig** with an X.509 certificate embedded in the document |
| **ELM v3 / European Digital Credentials** (fetched: `github.com/european-commission-empl/European-Learning-Model`) | Europass credential model: W3C Verifiable Credentials expressed as JSON-LD, "fully mapped to the ELMO/EMREX standard", covering qualifications, learning opportunities, accreditation and person identity | VC proof (JWS/Data Integrity) |
| **CLR 2.0 / Open Badges 3.0** (not fetched; pages did not render) | US-centric learner record and badge specs: achievements with credits earned, grade/result, term, alignment, evidence, verification | VC proof |
| **PESC / EdExchange (US and Canada)** (fetched: `github.com/pesc-org/json-ld-transcript`, `github.com/pesc-org/json-ld-code`, `github.com/pesc-org/canpesc-common-digital-layout`) | The North American college transcript standard: XML and now JSON/JSON-LD, built on CEDS data elements (e.g. `P000057` credit units, `P000058` credit value, `P001298` academic grade scale code, `P000043` CIP code, `P001517` SCED code) with SKOS code lists (grade status, credit basis, credit levels, honours levels, document completeness) | **Not signed in the schema.** The only "signature" in the PESC schemas is the student's release consent: `ReleaseAuthorizedIndicator` with `ReleaseAuthorizedMethod` = `Signature` (signed and dated written consent) or `ElectronicSignature` (FERPA-compliant authenticated username and password). Integrity rests on the exchange network and on vendor-issued certified PDFs, not on the document |

The ELMO example was read in full; the other rows are stated at a level I am confident about
rather than quoted, and are marked as such.

## What we hold today

| Namespace | Elements |
|---|---|
| `org.iso.23220.photoid.1` | `given_name`, `family_name`, `birth_date`, `document_number`, `issuing_authority`, `issuing_country`, `issue_date`, `expiry_date` (+ optional `portrait`) |
| `org.iso.23220.education.transcript.1` | `student_id`, `courses` (one JSON string of `{courseCode, courseName, credits, grade}`), `total_credits`, `status` |

Revocation is per credential through a signed status list referenced from the MSO — ahead of
the XML-DSig patterns above, which have no revocation mechanism at all.

## Gaps, in the order a registrar would care

### Tier 1 — a transcript cannot currently be interpreted

1. **No programme context.** ELMO states the *degree programme* a transcript belongs to
   (`learningOpportunitySpecification` with `type`: Degree Programme, `title`, `iscedCode`,
   `credit` with `scheme`/`level`/`value`). Ours lists courses with no statement of which
   award they belong to, so Trust University cannot tell what the transcript is *of*, and the
   link to the qualification credential is implicit in the holder's wallet.
2. **No grading scheme.** ELMO carries `gradingSchemeLocalId` plus `gradingScheme`
   definitions (a `localId`, a description such as "A number of the scale from 0.0 to 100.0",
   pass/fail variants) and reports the result as `resultLabel` ("45.1", "C", "Innpasset").
   Our `grade: 8.1` is uninterpretable: no scale, no maximum, no pass mark, no idea whether
   it is a 10-point Dutch mark, a 4.0 GPA or a percentage.
3. **No credit scheme.** ELMO's `credit` is `{scheme, level, value}` — ECTS in the example.
   Our `credits: 9` and `total_credits: 27` say nothing about the unit (ECTS? US semester
   credits? CATS?), so a recognition officer cannot convert or total them.
4. **No academic period.** ELMO attaches an `academicTerm` (title plus start/end) to the
   result, and the programme to its `start`/`end`. A transcript is normally organised by
   year/session; ours carries no dates at all, which also removes the "when did they attend"
   question a registrar always asks.
5. **No result vocabulary.** ELMO uses a controlled `status` (`passed`) plus `resultLabel` for
   the mark. Our `status: "completed"` is a free string that cannot express *failed*,
   *withdrawn*, *in progress*, *exempted/transferred* — the distinctions that matter in
   admissions.
6. **No level.** ELMO gives per-result and per-programme level with the framework named
   (`type`: EQF, `value`: 5; national frameworks likewise). We have nothing, so a course
   cannot be placed on EQF/ISCED.

### Tier 2 — recognisability and automation

7. **Identifiers are free text, not typed.** ELMO types every identifier: learner
   (`nationalIdentifier`, custom), issuer (`pic`, `erasmus`, `schac`), opportunity (`local`,
   `elmo`, `nus`). Ours are bare strings — `issuing_authority: "Smart Academy"`,
   `student_id: "SA-1D370F8E"` — so machine matching to institution and learner registries is
   impossible. A registrar would want e.g. a ROR/SCHAC/Erasmus code for the institution and a
   typed scheme for the student id.
8. **Multi-language titles.** ELMO repeats titles per `xml:lang`, including the issuer's legal
   name in the original language. Ours are single-language free strings (and the credential
   carries no statement of its own language).
9. **No language of instruction**, per course or for the programme (ELMO
   `languageOfInstruction`).
10. **No workload.** ELMO has `engagementHours` (contact hours) alongside credits; useful for
    comparability, and cheap to add if the academic record holds it.
11. **No course grouping or type.** ELMO groups results (`groupType`/`group`, e.g. mandatory
    versus optional subjects) and types each component (Course, Class, Lecture, Lab). Our
    `courses` is a flat list; a registrar cannot see whether a course was core or elective.
12. **No cohort context for grades.** ELMO's `shortenedGrading` (percentage lower/equal/higher)
    and `resultDistribution` (category counts: 43 below 20, 193 in 20-39.9 …) let a foreign
    admissions office normalise a mark. This is the single most "recognition-friendly" element
    in the pattern and the one nobody expects us to have.
13. **No attachments or document metadata.** ELMO attaches the transcript PDF as
    `type: Transcript of Records` with a title, and a diploma supplement with its numbered
    sections (including 7.2 *Signature* and 7.3 *Capacity* — "Vice Rector … on behalf of the
    Examination Board"). We have no document-level type, version, page count, or the human
    attestation of the registrar's office.

### Tier 3 — structural

14. **`courses` as one JSON string cannot be selectively disclosed.** mdoc digests are
    per-element, so an applicant can only share all courses or none. This was a deliberate
    portability trade-off, and it cuts both ways: a registrar often wants "programme + overall
    result + credits", not the full list — which argues for **first-class aggregate elements**
    (programme, overall result, credit scheme, total) rather than per-course disclosure.
15. **No diploma supplement** to accompany the qualification credential, and no accreditation
    or alignment metadata (ELM/CLR carry these).
16. **No stated purpose or audience** on the transcript ("issued for admission to X"), which
    some institutions print; and no `citizenship`, which ELMO carries but which is
    privacy-sensitive and should stay optional.

## What the US pattern adds

The PESC model (read from the schemas and validation reports in `pesc-org`) is more administrative
than ELMO: it is built around **credit hours, grade points and the provenance of credit**. It
confirms the Tier 1 gaps above — it has academic sessions, credit units and value, an academic
grade scale code per course, a programme classification code, result status codes and multi-language
titles — and it adds these, in the order a US registrar would care:

| US element | Why it matters | Our position |
|---|---|---|
| `creditHoursAttempted` **vs** `creditHoursEarned`, `creditHoursForGPA` | Every US transcript separates what was attempted from what was earned, and computes the average over GPA-basis hours only. A single `credits` number cannot express a withdrawn or failed course | Missing |
| `gradePointAverage`, `totalQualityPoints`, `gpaRangeMinimum`/`gpaRangeMaximum` | The average is stated **with its range**, and quality points make it checkable. This is the grading-scale gap expressed numerically | Missing |
| `AcademicSummary` typed by `AcademicSummaryType` — `SenderOnly`, `TransferOnly`, `TransferNotRepeated`, `CarryoverCredit`, `Weighted`, `NonWeighted`, `AcademicRenewal` | Institutions publish several averages at once: institutional, transfer, cumulative, weighted. One summary is not enough for an admissions decision | Missing |
| `courseOverrideSchool`, `overrideSchoolCourseNumber`, `CreditBasis` (`Transfer`, `StudyAbroad`, `AdvancedPlacement`, `CreditByExam`, `InternationalBaccalaureate`, `Military`, `Coop`, `Internship`, `Reciprocal` …), `SchoolOverrideCodes` | "Where did this credit come from?" is the second question after the average. ELMO has the same concept (`schoolOverrideCodes`), so both patterns carry it | Missing |
| `CourseAcademicGradeScaleCode` per course, `CourseCreditUnits`/`CourseCreditValue`/`CourseCreditBasis`/`CourseCreditLevel` | Scale and unit are stated per course, not just globally — a transcript can mix scales and credit bases | Missing |
| `ProgramCIPCode` plus `CSIS`/`HEGIS`/`ESIS`/`USIS`/local codes | Programme classification is a coded, required field, and several schemes coexist | Missing (the ELMO equivalent is ISCED-F) |
| `courseOverrideSchool`, `requirement`, `attribute` on courses | Tags a course to degree requirements and attributes (core, elective, general education) — ELMO's grouping by another name | Missing |
| `documentOfficialCode`, `documentID`, `documentTypeCode`, `documentProcessCode`, `documentCompleteCode` | **Official versus unofficial**, and complete versus partial, are first-class. `DocumentCompleteCodes` notes that "Partial generally means that the remainder will be sent in hard copy" | Missing — though our signed credential is *always* official, and we never say so |
| `delinquencies`, `residency` | Holds that qualify or block an official release; in-state/out-of-state for fees | Missing (a revoked credential is our nearest analogue) |
| `academicHonors` with `honorsLevel` (`FirstHighest`, `SecondHighest`, `ThirdHighest`), `honorsTitle`, `AcademicAwardLevels` | Classification of award and honours | Missing (`gpa` only) |
| `ReleaseAuthorizedIndicator` + `ReleaseAuthorizedMethod` | Records *that the student authorised this release*, and how | Missing — our holder consent is implicit in the presentation |
| `DocumentRecipient`, `RequestTrackingID` | The transcript names who it was issued to and carries the exchange reference | Missing |
| Test scores, licensure, additional achievements, degree requirements | Adjacent artefacts carried in the same document | Out of scope for us |

### On signing, which is the part that surprised me

In the US pattern the transcript *document* is not what is signed. The schema's only signature
semantics are the student's **release authorisation** (FERPA-compliant), and integrity comes from the
exchange network plus vendor-issued certified PDFs. ELMO, by contrast, embeds an XML-DSig with an
X.509 certificate; and ours is signed twice — the mdoc `issuerAuth` and the status list — with
selective disclosure and revocation the other two lack. On revocation and integrity we are ahead;
what we lack is the *administrative* framing (attempted vs earned, the average with its range,
provenance, official status, and the record of who authorised the release).

## Recommendation

Tier 1 is what stands between us and a transcript a registrar can actually act on, and it is
mostly data the academy already has — programme, grading scale, credit unit, term and result
outcome. Tier 2 is what makes it recognisable without a human phoning the university.

The US pattern reinforces two of these and adds three of its own, which belong in Tier 1 because
both traditions treat them as basic:

- **attempted versus earned credit**, and the average stated **with its range** and quality points;
- **the provenance of each credit** (institutional, transfer, study abroad, AP/IB, credit by exam);
- **official status and completeness** of the document — and, since our signed credential is always
official, saying so rather than leaving it implicit;
- **the record of the student's release authorisation** (their consent to this disclosure);
- **who the transcript was issued to** and the exchange reference, which US practice carries inside
the document.

One deliberate reversal to consider: because `courses` is a single element, the aggregate view
should be carried as its own elements (Tier 1) rather than expecting applicants to disclose
their full course list to prove a programme and a result. That is the practical answer to
gap 14 and it fits what registrars ask for.

Story: P0-21.
