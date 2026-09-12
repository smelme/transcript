# P0-21: Transcript claim completeness

**Priority:** P0 — the transcript is not interpretable without Tier 1
**Status:** Blocked on the institution's answers to `docs/analysis-discovery/transcript-model-facts.md`
(sections A-E); Tier 2 additionally on F
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

- Typed identifiers: institution (`schac`, `erasmus`, ROR), learner id scheme, course code
  scheme.
- Multi-language titles for institution and programme, plus language of instruction.
- Course grouping (mandatory/optional), component type, and workload hours.
- Document metadata: transcript type, version, and the attesting office and capacity.
- Grade distribution (cohort context) where the institution can supply it.

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

1. Tier 1 claim set in the generator and the mdoc builder, with unit tests asserting the
   scheme accompanies every mark and that aggregates are separately disclosable.
2. Share categories and portal labelling for the new elements; the wallet summary (_P0-20_).
3. Tier 2 claim set, gated on the academy supplying the data.
4. Trust University renders the richer transcript (_P0-19_).

## Definition of done

A registrar reading only the verified claims can place the study, interpret every mark and
credit, and see the outcome; the negative path (a credential lacking the new elements) still
verifies and is reported as "scheme not stated" rather than misread; and the change is
submitted for review.
