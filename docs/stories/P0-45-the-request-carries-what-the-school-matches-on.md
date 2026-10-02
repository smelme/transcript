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

## Fixed after the first run through the flow, 27 September 2026

The review screen asked the applicant to check their answers and then showed those answers as dashes:
the name and the number, and no row at all for a phone number or a student id that had been given.

The cause was not the summary. The document check sends the browser out to the provider and back, and
the page that returns is a fresh one with no memory of the form: only the address (kept in local
storage) and the date of birth (read from the case) survived it. Everything else lived in component
state and left with the page.

So the answers are read from the case, which is where they actually are. The applicant's own view now
hands back the name, the phone number, the number the record is matched by, the student id, what they
asked for, the fee and the promised period. It is their own submission behind their own handle, so
giving it back costs nothing, and the review fills itself in however the applicant arrives at it: back
from the document check, back from the payment page, or from a saved link on another device.

The phone number is now its own row when there is one, and the **Fee** row is gone: the amount was not
known at that point in the flow, so the row could only ever read as a dash, and the payment page
states it where it is being paid.

Covered by *"the applicant's own view gives them back what they gave us"* — the coverage this view
should have had from the start, since the review screen is only ever as good as what the view hands
it.

## The name is not asked for either, from the same run

Step one asked for a full name. It should not: the applicant is about to hold a document up to the
camera, and the name the school is asked to match a record against should be the name the document
carries rather than one typed into a form. A typed name is a name nobody verified, and in this flow
the applicant is exactly the person the institution could not identify on its own.

So the form asks for the address, the number the record is filed under, a student id when they know
it and a phone number when they want to give one. The check reads the name and the date of birth off
the document, and **both are shown back on the review step marked "from your document"**, which is
also the last moment either can be seen before somebody pays for a search made with them.

The name the document gave is written onto the case, so the reviewer's queue, the credential preview
and the credential itself all spell it the way the document does, and a name sent in the request body
is ignored. The number and the student id reached the case but were **not** in the response the
reviewer's screen reads, which is why that screen showed a dash where the number should be: the field
was missing from the API rather than from the form. Both are now on the case detail, and the queue
carries neither, because a list of numbers is a list nobody needs to be holding.

Guarded by *"the case carries the number, and the document carries the name, to whoever looks the
record up"*, which signs in as a registrar of the institution, opens a case through the applicant's
own door, reads it back, and confirms another institution can read none of it.
