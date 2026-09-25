# P1-14: The institution publishes, Quals issues

**Status:** In progress
**Components:** `issuer-service` (new invitation API), `quals-frontend` (new issuing page),
`issuer-frontend` (claim page becomes a redirect)

## The change

Issuance was the academy's to run: its form asked the issuer to invent an academic record, and its
own page at the academy's address signed the holder in, showed them the items and produced the
offer. The institution never supplied the claims, and the holder's experience carried the academy's
name even though the wallet and the credential are Quals things.

Now the institution publishes and Quals issues.

| Step | Who | What |
| --- | --- | --- |
| 1 | `POST /issuance/invitations` | the institution sends the holder's address and the claims, authenticated with its API key |
| 2 | issuer | holds the claims as an invitation with a 30 day life, and the key's institution stamps it |
| 3 | issuer | emails the holder a Quals link, and returns the same link to the caller so it can redirect instead |
| 4 | Quals | the holder opens the issuing page, lands signed in from the link or signs in with an email code |
| 5 | Quals | shows what will be issued and by whom, takes terms, then offers the QR, the app link and the deep link |
| 6 | wallet | claims the credential from the issuer, exactly as it does today |

## Decisions taken

**The institution sends the claims.** The generator survives behind a demo flag, but the API the
academy calls carries the credential. This is what makes the integration real: the registry is the
source of truth for what was studied, and the issuer no longer invents a record.

**The holder proves control of the address the institution supplied.** A single-use token in the
link gets them in without a code, and an email code is the fallback when the link is old or came
from somewhere else. The institution vouched for the address, so control of the address is the
claim being tested. A stronger identity check is a later story, and this one says so rather than
implying it happened.

**The academy's claim page becomes a redirect, not a deletion.** A link already sitting in
somebody's inbox must not 404, so `/claim` forwards to the Quals issuing page rather than the page
disappearing. The academy keeps an action that calls the API and sends the holder onward.

**Unclaimed credentials expire after 30 days**, matching the share TTL so one rule covers both kinds
of holding, and an expired invitation is deleted rather than kept as a hazard.

## What stays the same

- The mdoc, the offer, the QR, the app link and the wallet's claim call are untouched. The wallet
  cannot tell the difference, which is the point.
- The portal manages credentials, keys and audit as before. Invitations appear in the audit log.
- The issuer's signing keys, status list and revocation are unaffected.

## Acceptance criteria

- An API key from one institution cannot create an invitation for another, and a request without a
  valid key is refused.
- The invitation stores the claims it was given, serves them back only to the holder, and deletes
  itself 30 days after being created if unclaimed.
- The holder can open the link and be signed in without typing anything, and can also reach the
  same page and sign in with a code.
- The issuing page names the institution, lists what will be issued, and produces a working offer.
- The academy's old claim link leads to the Quals page rather than an error.

## Verification

- Unit tests: invitation creation refusals, claim storage, expiry pruning, token single use.
- A scripted end-to-end: create an invitation with an API key, open the link, verify, take the
  offer, and check the wallet's claim call still succeeds.
- The issuing page measured at phone and tablet widths.
