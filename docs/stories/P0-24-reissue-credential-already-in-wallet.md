# P0-24. A credential in a wallet must not block issuing it again

## Why

On the academy site, a student whose wallet already held a credential could not ask for it again.
Two independent refusals, both treating "already held" as a terminal state:

1. **The site would not let it be selected at all.** The claim page disabled the checkbox for any
   credential with `inWallet`, so there was no way to ask.
2. **The issuer refused the offer.** `POST /academy/credentials/:sessionId/offer` returned
   `{ alreadyInWallet: true }` with no offer, and the page turned that into the error
   "Your transcript is already in your wallet.". Which also stopped a multi-credential run
   part-way through.

The holder did nothing wrong. They wanted the credential on another device, or wanted it back
after deleting it, and the product had no way to say yes.

## Decision

- **Holding a copy is not a reason to refuse.** Asking again is asking for the document, so the
  credential is issued again.
- **A re-issue is a new document, not the old one replayed.** It gets its own credential id, its own
  status index, a device-bound mdoc for the device claiming it, and today's issue date. The day it
  is issued, not the day the original invitation was prepared.
- **The copy already held is untouched.** It keeps its own date and stays active. Replacing it is
  the operator's revocation flow, not a side effect of issuing another.
- **Duplicate protection stays.** A session already claimed is still refused *unless* the offer it
  is claimed from says the holder asked for a re-issue. The marker travels inside the offer, so a
  double tap, a retry, or a replayed stale offer cannot mint a second credential.
- **The page says what will happen** rather than silently issuing another copy: the held credential
  keeps its "In wallet" badge, becomes selectable, and the offer step states that a new copy is
  being issued and that the old one remains valid until revoked.

## What changed

| Layer | Change |
|---|---|
| `issuer-service/src/index.js` | `buildCredentialOfferUrl(session, { reissue })` marks the offer; `isReissueOffer` reads it back; the offer endpoint re-offers instead of refusing and returns `reissued`; `claimIssuanceSession` / `issueForSession` accept `allowReissue` and re-date the document; `/wallet/issuance` only honours the marker carried in the offer |
| `issuer-service/src/credential-generator.js` | `todayIso` exported, so a re-issue is dated by the same definition of "today" as every other path |
| `issuer-frontend/app/claim/page.tsx` | A held credential is selectable; the blocking `alreadyInWallet` branch is gone; the offer step states a new copy is being issued |
| `issuer-frontend/app/get-credentials/page.tsx` | Badge reads "In your wallet · you can add it again" |
| `scripts/check-reissue.mjs` | Live check against a running issuer: sign in, list credentials, ask for an offer for one already held, require `reissued: true` |

## Verification

- `issuer-service` tests: **81 pass, 0 fail**. Three new: a re-issue is a distinct credential and
  leaves the earlier one active; the retry without `allowReissue` is still refused; the re-issued
  copy carries today's date while the original keeps its own; and only an offer carrying the marker
  counts as a re-issue.
- Academy site: typecheck, lint and production build all clean.
- Live, against the running issuer: `node scripts/check-reissue.mjs` →
  `s.melese+88@gmail.com: 7 credentials, 6 already in the wallet`, `offered true`, `marked reissue
  true`, `refused false` → **OK**.
- Not yet done: claiming the re-issued offer from the phone, which needs the device (blocked on an
  unauthorised USB connection). The claim guard and the re-dating are covered by tests.

## Note

A re-issued credential is a second credential: the wallet will hold both until the first is
revoked. That is the operational flow already agreed for replacing a credential, and it is stated
on the page rather than left for the holder to discover.
