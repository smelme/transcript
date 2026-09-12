# Transcript model facts needed before P0-21

> **Status: the US conventions below are in use as the demo's values (decided 2026-09-13), so
> Tier 1 is implemented and the rows are marked *US default*. They are the demo's, not the
> academy's: every one of them is a value the institution owns, and supplying the real ones is a
> configuration change rather than a code change. The one thing that must not happen is a scale
> being invented and read as real, which is why each value states its own scheme in the
> credential and anything unknown is omitted.**

**Why this exists:** the generator must not invent grading or credit facts. A wrong scale is worse
than a missing one, because a reader cannot tell an invented scale from a real one - and the
current demo already does this: it used to mark courses on a 1-10 scale (`5.5 + rng() * 4.5`)
while carrying a 4.00-scale `gpa`, under a Dutch institution, with no scheme stated anywhere. That
contradiction is gone: marks are letters with 4.00-scale points, and the scale travels with them.

**How to answer:** write after each `Answer:`. The *demo default* column is what the generator does
today - a placeholder, not a decision. If a fact is unknown, answer **omit** and the element is
simply not modelled; nothing else breaks (P0-21 acceptance criterion 4).

## A. Grading

| # | Fact needed | Drives | Demo default | Answer |
|---|---|---|---|---|
| A1 | Short machine id for the scale, e.g. `nl-10` | `grading_scale_id` | `nl-10` (invented) | |
| A2 | Human label, as printed on the document | `grading_scale_label` | "Dutch grading scale 1-10" | |
| A3 | Minimum, maximum, pass mark | `grading_scale_minimum` / `_maximum` / `_pass_mark` | 1 / 10 / 5.5 | |
| A4 | Is a mark an integer or one decimal? | per-result mark precision | one decimal (7.8) | |
| A5 | **How the average is computed:** credit-weighted, unweighted, or not published at all | `average_*`, `quality_points` | invented 3.00-4.00, no scale | |
| A6 | Result vocabulary: which of `passed`, `failed`, `withdrawn`, `exempted`, `in progress` you use, and the native term for each | `outcome`, `outcome_scheme`, per-result outcome | free text `"completed"` | |
| A7 | Is the recorded mark the final mark after any resit, or can both attempts appear? | whether a resit is representable | not modelled | |

## B. Credits

| # | Fact needed | Drives | Demo default | Answer |
|---|---|---|---|---|
| B1 | Scheme name and id (ECTS? national?) | `credit_scheme`, per-result `credits_scheme` | assumed, never stated | |
| B2 | Credits per course and the programme total, as the institution records them | `courses[].credits`, `total_credits` | 6 / 12 / 18, summed | |
| B3 | Is a full academic year 60 credits? (sanity check on totals) | validation only | assumed | |
| B4 | **Does a failed course consume attempted credits but not earned credits?** | `credit_hours_attempted` / `_earned` / `_for_average` | not modelled | |
| B5 | Do you want a US credit-hour view at all, and if so what conversion does the institution sanction? | `credit_hours_*` | omitted | |

If B5 is "no conversion sanctioned", the elements stay out: credits are never converted silently,
and a US reader is given the ECTS value with its scheme named (P0-21 criterion 8).

## C. Programme

| # | Fact needed | Drives | Demo default | Answer |
|---|---|---|---|---|
| C1 | Programme title as printed, and any second language | `programme_title` | invented from level + field | |
| C2 | Level value and the framework that defines it (EQF? national?) | `programme_level`, `programme_level_framework` | "Bachelor" / "Master", no framework | |
| C3 | Programme classification: ISCED-F code and label, CIP, or both (Trust University is US-facing) | `programme_code`, `programme_code_scheme` | `BSC-CS` (invented, no scheme) | |
| C4 | The award the programme leads to (e.g. "Bachelor of Science") | award element | not modelled | |
| C5 | Programme type vocabulary (degree / exchange / non-degree) | `programme_type` | not modelled | |

## D. Institution and periods

| # | Fact needed | Drives | Demo default | Answer |
|---|---|---|---|---|
| D1 | Institution identifier scheme and value the academy actually holds (SCHAC, Erasmus, ROR, national register) | `institution_id`, `institution_id_scheme` | name only | |
| D2 | Legal name versus trading name | `institution_name` | free text | |
| D3 | Academic year boundaries (e.g. 1 September - 31 August) | `enrolment_start` / `_end` | derived from graduation | |
| D4 | Term names and dates, or is the record programme-level only? | per-result academic term | not modelled | |
| D5 | Student identifier scheme and value - and is it a national identifier? | `student_id`, `student_id_scheme` | free-text id | |

If D5 is a national identifier, it does not go in the core namespace: it would then be a
jurisdiction-legal element and would need its own namespace or to be omitted.

## E. Document and release - a scope decision, not a fact

The US pattern carries "issued to", "release authorised" and a tracking reference *inside* the
document, because a paper transcript is produced for one named recipient at one moment. A
reusable digital credential is different: it is issued once and presented many times, so at
issuance we do not know where it will go, and any value we wrote would be stale by the second
presentation.

| Element | Recommendation | Answer |
|---|---|---|
| `document_status` (official/unofficial), `document_completeness` | Keep in the credential: both are properties of the credential itself | |
| `issued_to`, `release_method`, `request_reference` | Move to the verifier's session record, which already knows the relying party, the time and the outcome - so the release is evidenced where it actually happens | |
| `document_id`, `document_type`, `document_issued_at` | Keep only if they name the registrar's own record (its serial and issuance); if they would repeat the credential's number, drop or rename them | |

## F. Tier 2 sourcing

| # | Fact needed | Answer |
|---|---|---|
| F1 | Workload hours per course, and whether that means contact hours or total notional hours | |
| F2 | Course grouping (mandatory / optional / elective) and component type | |
| F3 | Language of instruction, per programme and per course | |
| F4 | Multi-language titles for institution and programme | |
| F5 | Grade distribution / cohort context - can the academy supply it at all? | |

## What happens to each answer

- A, B, C, D and F answers become generator inputs; anything answered **omit** is not modelled.
- D5 answered "national identifier" triggers a namespace decision before implementation.
- E is decided once: the credential keeps the document's own status, the release stays with the
  presentation, and the Tier 1 element list shrinks by three elements.
- P0-21 Tier 1 starts as soon as A, B, C, D and E are answered; Tier 2 waits on F.
