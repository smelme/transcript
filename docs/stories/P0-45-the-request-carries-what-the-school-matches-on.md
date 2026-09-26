# P0-45: The request carries what the school matches on

**Status:** ✅ Done — 2026-09-27
**Components:** `quals-frontend` (the request wizard), `issuer-service` (the request record),
`quals-portal` (what a reviewer reads)
**Depends on:** P0-36/P0-37/P0-38 (asking, the fee, the review)
**Blocks:** nothing

## Why

A person asking this way is somebody the institution **cannot** identify from an address alone. The
case is matched to a record by hand, so what the applicant sends has to be enough to find them: a
name and an address are not.

The identity check already extracts a **date of birth** from the document, and it was being stored and
shown to the reviewer — but nothing on the applicant's side said so, nothing asked for the one number
that identifies a person in most registry lookups, and nothing carried a **student id**, which is what
the school's own record is filed under.

## What changed

| Where | What |
| --- | --- |
| The wizard | A **social security number**, entered by hand and required: it is the identifier the record is looked up by, and a case without one cannot be matched |
| The wizard | A **student id**, optional — if the applicant knows it, it shortcuts the search at the school |
| The record | `applicant_ssn` and `applicant_student_id`, added to `credential_requests` with the same add-if-missing migration the other columns use |
| The reviewer | The number and the student id are shown with the details, beside the date of birth the check extracted |
| The review step | The applicant sees what is being sent before they pay, including the date of birth the document confirmed |

**The date of birth is not asked for.** It comes from the identity check, so the applicant cannot get
it wrong, and the reviewer has both the document's version and the name the applicant typed — which is
the pair that makes a mismatch visible.

## A note on storing a social security number

This is the most sensitive thing the system holds, and it is stored as it arrives so that a person can
read it and match a record by hand. That is what the flow needs, and it is worth naming rather than
leaving implicit: the database is not encrypted at rest, so anyone who can read it can read this. If
that is not acceptable, the two options are to encrypt the column with a key held in the environment,
or to keep only the last four digits plus a hash and accept that matching gets weaker. **Raised with
the product owner rather than decided here.**

## Also, from the same review

Two pieces of copy that the screen did not need: the review step listed **"Answer within 10 working
days"** as a summary row when the line above it already says the same thing, and the button said
"Pay 30.00 USD and send my request" where the amount is in the summary directly above it. The row is
gone and the button says **Pay**.
