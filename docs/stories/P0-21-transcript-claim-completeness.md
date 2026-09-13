# P0-21: Transcript claim completeness

**Priority:** P0 — the transcript is not interpretable without Tier 1
**Status:** In progress — Tier 1 is implemented under **US conventions** (see below), because the
academy has not supplied its own grading and credit model. Every value the academy owns is a value
in the generator rather than a structure, so swapping them is a configuration change. Tier 2 is
still gated on the academy supplying the data
**Components:** Credential generator, mdoc builder, share categories, portal, wallet, Trust University RP
**Analysis:** `docs/analysis-discovery/transcript-claims-gap-analysis.md` (ELMO/EuroLMAI pattern)

## User story

As a registrar, I want a presented transcript to tell me which programme it belongs to, how
the marks and credits are scaled, when the study happened and what the outcome was, so that I
can make an admission decision without contacting the issuing institution.

## Scope — Tier 1 (interpretability)

- **Programme context**: the transcript states the programme it belongs to — title, type
  (degree programme), field of study (ISCED-F code and label), level with its framework named
  (EQF), and the award it leads to.
- **Grading scheme**: every mark is accompanied by an identifiable scheme — an id, a
  human-readable description of the scale, its minimum, maximum and pass mark — and the
  result is reported as a label rather than a bare number.
- **Credit scheme**: credits and total credits state their scheme (ECTS, or whatever the
  institution uses) and level.
- **Attempted versus earned credit**: each result separates what was attempted from what was
  earned, and the credits that count towards the average are identifiable.
- **Overall average with its range**: the average is stated with the range it sits on and, where
  the institution computes them, the quality points behind it.
- **Provenance of each credit**: whether it was earned here, transferred, studied abroad, or
  awarded by examination or another body (the US model's `CreditBasis` and `courseOverrideSchool`;
  ELMO's `schoolOverrideCodes`).
- **Academic period**: each result carries its academic term (title plus start and end), and
  the transcript carries the enrolment period.
- **Result vocabulary**: a controlled outcome per result (`passed`, `failed`, `withdrawn`,
  `exempted`, `in progress`) alongside the human label, replacing the free `status` string.
- **Level**: per-result and per-programme level, framework named.
- **Document status**: the transcript states that it is the official document (our signed
  credential always is), whether it is complete or partial, and its own document identifier.
- **Release authorisation**: the credential records that the holder authorised the disclosure
  and by what method, so a recipient can see the consent rather than infer it.
- **Issued to**: the relying party the credential was presented to and a reference for the
  exchange, as US practice carries inside the document.
- **Aggregates**: programme, overall result, credit total and scheme travel as their own
  elements so an applicant can disclose a summary without their whole course list (see gap 14).

## Scope — Tier 2 (recognisability), same story, second increment

**Implemented behind an issuance option, with demo sample values** (see "Recognition details"
below). It stays a separate increment because it is recognisability rather than interpretability: a
record without it still reads, so the academy can replace the samples without invalidating anything,
and a holder who would rather disclose less can leave it out at issuance.

- Typed identifiers: institution (`schac`, `erasmus`, ROR), learner id scheme, course code
  scheme.
- Multi-language titles for institution and programme, plus language of instruction.
- Course grouping (mandatory/optional), component type, and workload hours.
- Document metadata: transcript type, version, and the attesting office and capacity.
- Grade distribution (cohort context) where the institution can supply it.

### Recognition details, as implemented

`POST /academy/requests` takes `recognition` (default true; `false` omits them), and the academy app
offers it as a checkbox with the trade-off spelled out. When they are issued they are the
institution's own identifiers and the module's own workload, never something a reader must infer:

| Element | Sample value |
|---|---|
| `institution_id` + `_scheme` | `smartacademy.example` (SCHAC is a domain), with `institution_ror` and `institution_erasmus_code` alongside |
| `student_id_scheme` | `institution-student-number` |
| `institution_name_alt` / `programme_title_alt` (+ `_language`) | `Smart Academie` / `Informatica`, language `nl` |
| `language_of_instruction` | `en` |
| per course: `codeScheme`, `grouping`, `componentType`, `contactHours`, `workloadHours`, `cohortSize`, `cohortMeanGradePoint` | a 3-credit module is 45 contact hours and 135 hours of work; `mandatory`/`optional`; the cohort figure is size and mean, not a full distribution |
| `transcript_type`, `document_version`, `attesting_office`, `attesting_capacity` | `official-transcript`, `1`, `Office of the Registrar`, `Registrar` |

The samples live in one place, `RECOGNITION_SAMPLES` in `credential-generator.js`, and are fixed
rather than generated - an identifier that changes per student is not an identifier. A qualification
carries the institution identifiers too, so an employer checking an award can recognise the issuing
institution by more than its name. Omitted values are absent rather than blank, so a reader can tell
"not supplied" from "supplied empty".

## Namespace strategy

Decided before implementing, because it changes where every new element goes:

- The **shared core** (institution, programme, results with scale, credits with scheme, period,
  outcome, aggregates) stays in `org.iso.23220.education.transcript.1`, scheme-qualified, so one
  credential serves a European recognition officer and a US registrar alike.
- The **administrative-record extras** (attempted vs earned, averages with range and quality
  points, credit basis, documented status and completeness, release authorisation, destination)
  go in their own namespace as a **supplement to the transcript, not a rival transcript**: the
  transcript stays the single source for what was studied (programme, courses, marks), and a
  registrar requests both. Open decision: whether the academic-record document identity
  (`document_type`, `document_id`, `document_issued_at`) names the *registrar's* record - which is
  information no other namespace holds, and justifies the elements - or merely repeats the
  credential's own number, in which case drop or rename them. See "Who asks for which" in
  `docs/architecture/transcript-credential-architecture.md`.
- **Jurisdiction-legal or privacy-sensitive claims** (consent framing, national identifiers,
  ethnicity, residency) do not go in the core namespace, and the ones we should not hold at all
  are simply not modelled.
- **A total is always per scheme**: credits of different schemes are never summed or converted
  inside the credential.

## Acceptance criteria

1. A presented transcript alone answers: which programme, at which institution, over which
   period, with which marks on which scales, how many credits of which scheme (attempted and
   earned), which of them came from elsewhere, and with what overall outcome.
2. Every numeric mark is accompanied by its scheme, and no scale is assumed by the reader.
3. The overall average states its range, so a reader can tell an A from a 9 out of 10.
4. The aggregate elements can be disclosed without disclosing `courses`.
5. Existing credentials are unaffected: no new element is required for a credential to verify,
   and the old free-text `status` remains readable where it was issued.
6. The portal and the wallet show the programme and the outcome rather than internal codes.
7. Trust University's registration page renders programme, period, credits and outcome from
   the verified claims only.
8. Revocation, status-list and selective-disclosure behaviour are unchanged.
9. No value carries an ambiguous unit or scale: each states its scheme, and totals are per scheme.
10. The shared core can be requested on its own, and the administrative-record namespace can be
    requested on its own, without either depending on the other.

## Explicit non-goals

- No diploma supplement (it is a companion document and a separate story).
- No cohort/statistical data we cannot source from the academic record.
- No citizenship or other special-category personal data.
- No change to the mdoc document type or the status mechanism.

## Dependencies and blockers

- **Decision needed:** every fact in `docs/analysis-discovery/transcript-model-facts.md`. The
  generator must not invent them; a wrong scale is worse than none, and the current generator
  already mixes an invented 4.00-scale GPA with a 1-10 mark scale under one institution.
- Tier 2 depends on the academy's academic record carrying the data (workload hours, course
  groupings, language of instruction), which it may not.
- The US-derived items assume the registrar decides to carry them in the credential rather than
  relying on the presentation context (who it was presented to, when, and that the holder
  consented). Carrying them costs disclosure surface; leaving them out keeps the credential
  narrower. Recommendation (fact sheet section E): keep `document_status` and
  `document_completeness`, which are properties of the credential, and let `issued_to`,
  `release_method` and `request_reference` live with the presentation instead, since a reusable
  credential is issued once and presented many times and any value written at issuance would be
  stale by the second presentation.

## Delivery increments

1. **Done** — Tier 1 claim set in the generator and the mdoc builder, with unit tests asserting the
   scheme accompanies every mark and that the aggregates are separately disclosable.
2. **Partly** — the share categories request the new elements and Trust University renders them. The
   wallet now names the qualification a transcript belongs to, on the tile and in the detail view
   (2026-09-13, below). The portal still shows only the kind: its credentials table has no programme
   column, and the list it reads does not carry one yet.
3. Tier 2 claim set — **implemented behind the `recognition` option with demo samples**; the
   academy's own values replace `RECOGNITION_SAMPLES` when it supplies them.
4. Trust University renders the richer transcript (_P0-19_) — done with this story.

## US conventions used for now

Decided 2026-09-13, because the academy's own model is not available. Every one of these is stated in
the credential rather than left for the reader to assume: the 4.00 grade point average scale
(`us-gpa-4`, pass 2.00) with letter marks carrying their own grade points; semester credit hours
(`us-credit-hour`); the CIP 2020 taxonomy for the programme's subject; the IPEDS award level for its
level; and Fall/Spring terms counted back from the final one, so no term ends after the graduation.
Anything unknown is omitted rather than invented, and a qualification carries the same scale beside
its average so one number is never read two ways.

## Verification

Acceptance criteria, as implemented:

1. **Met** — the decoded record answers all of it: `programme_title` / `award_title`, institution,
   `enrolment_start` / `enrolment_end`, letter marks with `gradePoints` and a scale id, credits with
   their scheme plus `credits_attempted` / `credits_earned`, a per-result term, and `outcome`.
2. **Met** — `grading_scale_id`, `_label`, `_minimum`, `_maximum`, `_pass_mark` are elements of the
   transcript and every course repeats `markScaleId`; no scale is left to be assumed.
3. **Met** — the average carries `average_range_minimum` / `_maximum` and `average_weighting`, so a
   figure like 2.71 is unambiguously on the 4.00 scale.
4. **Met** — `total_credits`, `credits_attempted`, `credits_earned`, `overall_mark`,
   `overall_mark_scale_id` and `outcome` are elements beside `courses`, not inside it, so a holder
   can disclose the summary without the module list.
5. **Met** — `status` is still emitted, and a credential without the new elements still verifies.
6. **Partly** — the wallet names the qualification a transcript belongs to, and the outcome remains
   outstanding there; the portal shows the kind only, so a programme column is still to come. A
   transcript tile previously read "Academic transcript - Tessa Novak · Smart Academy · 5 courses ·
   14 credits", which does not say which qualification the transcript is for - the one thing a
   holder with two of them needs in order to choose. It now reads "Academic transcript - Tessa
   Novak · Smart Academy · Bachelor of Psychology · 5 courses · 14 credits", and the detail view
   carries Programme and Award rows. A summary stored before this change is re-read from the mdoc
   once and saved back, so credentials already in a wallet gain it without being claimed again.
7. **Met** — Trust University renders the institution, programme, award, credits earned, the average
   with its scale, and the module table, all from verified claims.
8. **Met** — revocation, status-list and selective-disclosure behaviour are untouched: 73 issuer,
   61 verifier and 29 wallet tests pass, with both share smoke tests and the academy flow.
9. **Met** — every value states its scheme and each total is per scheme: the core names
   `credit_scheme`, the supplement names `credit_hours_scheme`, and neither converts.
10. **Met** — the core is requestable on its own, and the supplement is a separate namespace a
    relying party may request with it or not at all.

Findings while implementing:

- **The generator could return fewer courses than it intended** — it drew at random and stopped at
  the first repeat. Courses are now chosen by a seeded shuffle, so a record always holds the number
  it means to.
- **Terms were not chronological and could end after graduation.** They are now counted back from
  the record's final term, and a test asserts both properties.
- **The release framing is settled:** `document_status`, `document_completeness`, `document_type`,
  `document_id` and `document_issued_at` are carried — the record's own identity, separate from the
  identity document's number — while `issued_to`, `release_method` and `request_reference` are not.
  A reusable credential is issued once and presented many times, so those belong to the presentation
  the verifier records rather than to the credential.

## Definition of done

A registrar reading only the verified claims can place the study, interpret every mark and
credit, and see the outcome; the negative path (a credential lacking the new elements) still
verifies and is reported as "scheme not stated" rather than misread; and the change is
submitted for review.
