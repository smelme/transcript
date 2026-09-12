# P0-21: Transcript claim completeness

**Priority:** P0 — the transcript is not interpretable without Tier 1
**Status:** Blocked on a decision about the grading and credit model
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
- **Academic period**: each result carries its academic term (title plus start and end), and
  the transcript carries the enrolment period.
- **Result vocabulary**: a controlled outcome per result (`passed`, `failed`, `withdrawn`,
  `exempted`, `in progress`) alongside the human label, replacing the free `status` string.
- **Level**: per-result and per-programme level, framework named.
- **Aggregates**: programme, overall result, credit total and scheme travel as their own
  elements so an applicant can disclose a summary without their whole course list (see gap 14).

## Scope — Tier 2 (recognisability), same story, second increment

- Typed identifiers: institution (`schac`, `erasmus`, ROR), learner id scheme, course code
  scheme.
- Multi-language titles for institution and programme, plus language of instruction.
- Course grouping (mandatory/optional), component type, and workload hours.
- Document metadata: transcript type, version, and the attesting office and capacity.
- Grade distribution (cohort context) where the institution can supply it.

## Acceptance criteria

1. A presented transcript alone answers: which programme, at which institution, over which
   period, with which marks on which scales, how many credits of which scheme, and with what
   overall outcome.
2. Every numeric mark is accompanied by its scheme, and no scale is assumed by the reader.
3. The aggregate elements can be disclosed without disclosing `courses`.
4. Existing credentials are unaffected: no new element is required for a credential to verify,
   and the old free-text `status` remains readable where it was issued.
5. The portal and the wallet show the programme and the outcome rather than internal codes.
6. Trust University's registration page renders programme, period, credits and outcome from
   the verified claims only.
7. Revocation, status-list and selective-disclosure behaviour are unchanged.

## Explicit non-goals

- No diploma supplement (it is a companion document and a separate story).
- No cohort/statistical data we cannot source from the academic record.
- No citizenship or other special-category personal data.
- No change to the mdoc document type or the status mechanism.

## Dependencies and blockers

- **Decision needed:** which grading and credit model Smart Academy actually uses (ECTS with a
  10-point Dutch scale and 5.5 pass mark, or something else), whether the programme level is
  EQF, and whether the institution has a SCHAC/Erasmus code. The generator must not invent
  these; a wrong scale is worse than none.
- Tier 2 depends on the academy's academic record carrying the data (workload hours, course
  groupings, language of instruction), which it may not.

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
