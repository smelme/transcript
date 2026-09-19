# P1-10: What a holder sees, and what a verifier is told when the answer is no

**Status:** Mostly done. One item moves with the share page to P1-11
**Components:** `mobile-wallet/.../ui/CardFace.kt`, `issuer-service/src/email-service.js`,
`issuer-service/src/wallet-account-service.js`, `verifier-frontend/app/verify-academic/page.jsx`,
`trust-university-frontend/app/page.jsx`

## The year went missing on the list card

The card draws its fields in one row: the date, the credential number, and on the list card the
VERIFIED pill. Three items and two columns means something has to give, and the date gave: the
value is drawn with a single line and no ellipsis, so a narrower card silently swallowed the year
and left `September`.

The pill has moved up beside the institution, which is where the detail card already had it. That
is the arrangement the holder already told us reads correctly, and it leaves the date and the
number one row to themselves.

Nothing was wrong with the formatting. `formatDate` always produced `September 2026`; the line was
being cut. Worth remembering next time a value looks truncated: check the width before the code.

## A sign-in code says which site it is for

Both the academy site and the wallet ask for a code the same way, and the message said
`Your wallet sign-in code` in both cases, which is wrong for a student standing on the academy site.
The email now knows its audience: the academy's message names the academy and says the wallet has
its own separate code, and the wallet's message is unchanged. The academy site says who is asking,
so the default stays right for the app.

## My Jobs refuses anything that is not an awarded qualification

An employer checking a qualification was shown a page of dashes when the wallet presented a
transcript or study still in progress. It verified, and it was not what the page is for. It now
says so plainly and asks for the credential for the completed award.

The check is `degreeLevel` and `graduationDate` present, and an outcome that does not say in
progress. It belongs to this page rather than to the verifier service, because the next page along
wants exactly the transcript that this one refuses.

## Trust University says when there is no transcript to read

The same problem in the other direction. A qualification holds an award and no study, so a registrar
can be handed a credential with no modules, credits or period of study. The page drew a definition
list of dashes and a note that no module list was disclosed. It now says there is no transcript
information in the credential and asks for the transcript instead.

## Still to do

The `courses` claim is rendered as raw signed JSON, so a reader sees an array of objects where a
table belongs. That page is moving to its own site (P1-11), so the table is part of that move rather
than a second edit here that would be thrown away.

## What was checked

- Issuer tests: 83 pass, 0 fail.
- The three sites lint clean, and the wallet builds and installs.
- The card fix is on the phone.
