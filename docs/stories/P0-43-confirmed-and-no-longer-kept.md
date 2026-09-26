# P0-43: The holder confirms, and the issuer stops keeping the copy

**Status:** ✅ Done — 2026-09-27 (issuer: `npm run test`; the arrival is read back from the issuer's
own records, never taken from the browser)
**Components:** `issuer-service` (records readback + `forgetMdoc`), `quals-frontend` (the end screen)
**Depends on:** P0-42 (one item per programme), P0-30 (add credential and scan)
**Blocks:** nothing

## The problem

Two things were missing at the end of the flow.

**Nothing checked that the credential arrived.** The page showed a QR code, the wallet scanned it,
and the browser had no idea whether anything had been collected. "Done" returned the holder to the
list they had just come from, as if the last step had not happened.

**The issuer kept the document.** The mdoc — the signed bytes that *are* the credential — is held in
the issuer's memory (`IssuerService.mdocSessions`) until a timeout, because the wallet collects from
there. Its own comment says the payload is never persisted, which is true of the database; it was
not true of the process. Once the holder has the document, a copy of it sitting in the issuer's
memory has no remaining purpose.

## The rule

**The arrival is read back from the issuer's records, and the bytes are dropped once it is real.**

- The browser says which credentials it was collecting. That is a hint, not evidence, so the answer
  comes from two things the issuer controls: the session's own status, and the metadata row in
  `credentials` the issue was recorded in. Both must agree before a credential counts as collected.
- **Only then** is the document forgotten. Forgetting it earlier would leave a holder who scanned the
  code with nothing, which is the one failure this flow must not have.
- Every copy of that programme that is already in a wallet is forgotten too, not only the one just
  added: the older copy is held by the same person and awaited by nobody.
- The **record** stays. That a credential was issued, to whom, when, and in what status is the
  institution's own history and the answer to any later question about it. It is the *document* that
  goes.
- An empty list of sessions is refused rather than read as "nothing to do", so a bug in the page
  cannot look like a successful collection.

## What changed

| Where | What |
| --- | --- |
| `issuer-service/src/index.js` | `POST /issuance/collection/confirmed` — ownership checked per session, answered from the issuer's records |
| `issuer-service/src/index.js` | `IssuerService.getCredentialRecord()` reads the metadata row; `settleCollected()` builds the answer and forgets what has arrived |
| `issuer-service/src/index.js` | `IssuerService.forgetMdoc()` drops one document from the in-memory session store |
| `quals-frontend/app/issue/page.tsx` | **Done** now checks rather than returns, and the end screen says what is in the wallet and what the issuer has stopped keeping |

## What the holder is told

> **Thank you**
> # All done
> Your credential is in your wallet.
>
> - Academic transcript — Master of Data Science · **In your wallet**
>   Graduated 30 Jul 2024
>
> You can close this page.

And no more than that, which is a rule rather than an accident. The first version ran to ninety-odd
words: that nothing was waiting, that the issuer had stopped holding a copy of the documents, what it
keeps instead, when to ask for another copy, and that sharing is a separate step. That is our
business, on a screen a holder reaches once, at the end of something that has already worked — and a
screen that explains itself at that length reads as though something still needs explaining.

So the end screen says the one thing the holder came for — it arrived — and stops. The record-keeping
that makes it true is in the story above and in the tests, where it belongs.

When something has **not** arrived the holder is not told it failed — the wallet may still be
finishing — so the page says what it cannot see yet, and offers to look again.

## A note on the "Done" button

The wallet's own finish button belongs to the wallet, and this page cannot see it. So the check runs
when the holder says they are finished here, and again if they say so again. That is honest about
what is known: the issuer reports what its records hold, and does not guess.
