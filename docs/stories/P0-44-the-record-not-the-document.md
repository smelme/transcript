# P0-44: The issuer keeps the record, not the document

**Status:** ✅ Done — 2026-09-27 (issuer: `npm run test`; the document is handed over once and never
stored, and no offer can be spent twice)
**Components:** `issuer-service` (the claim, the offer, the document store), `quals-frontend` (the chooser)
**Depends on:** P0-41 (real claims), P0-43 (the arrival is read back from the record)
**Reverses:** P0-24, which allowed a holder to re-add a credential already in their wallet

## The rule

**Once a credential is issued, the institution keeps the record of it and nothing else.** The
document exists to be collected, it is handed to the wallet in the same response that issues it, and
after that the issuer holds no copy — not in memory, not on disk, not in an offer that can be spent
again. A holder who needs a second copy asks the institution, which publishes again under its own
name: reissue is the institution's decision, not a button on a link that has already been used.

## What was true before this

Two things, both of which P0-43 had left in place:

1. **The document was stored in memory** (`IssuerService.mdocSessions`) with a TTL, and only let go
   when the holder pressed *Done* and the arrival was confirmed. That made "we do not keep it"
   conditional on the holder telling us something we had already been told by the issuance itself.
2. **An offer could be spent twice.** An offer for a session already in a wallet carried a reissue
   marker, and the claim accepted it: opening the link again and choosing the item again minted
   another credential, with a new id and a new status-list index. That was P0-24's intent — a
   holder replacing a phone should not have to ask the institution — and this story reverses it.

**And the store was already inert on this deployment.** `MDOC_SESSION_TTL_*` is unset, so the TTL
resolves to `0` and `getMdocSession` returns nothing the moment after the write. So nothing was in
fact being retained; it was retained by accident of arithmetic rather than by decision. That is the
part worth fixing properly: a rule that holds because nobody configured a variable is not a rule.

## What changed

| Where | What |
| --- | --- |
| `issuer-service/src/index.js` | `issueForSession` no longer stores the document — it is returned to the claimant and forgotten. The `allowReissue` path is gone, so a session that has been claimed can never be claimed again |
| `issuer-service/src/index.js` | `buildCredentialOfferUrl` no longer marks a reissue, and `isReissueOffer` is deleted: there is nothing for an offer to ask for |
| `issuer-service/src/index.js` | Both offer routes refuse a session already in a wallet, with the same sentence a holder would be given at the door: *ask the institution that issued it if you need another copy* |
| `issuer-service/src/index.js` | `GET /credentials/:id/mdoc` says plainly that no document is held, rather than blaming an expired session |
| `quals-frontend/app/issue/page.tsx` | An item already in a wallet is no longer offered: it is shown, marked, and cannot be chosen, because choosing it would now fail |

`settleCollected` still forgets any document for the credentials it confirms. It is now belt and
braces rather than the mechanism — and it still matters for anything issued before this change.

## What the chooser says, which this story had to fix twice

Removing the offer path made a state reachable that the page had no words for: a list where **nothing
can be added** because it is all in the wallet already. The heading and the line under it were written
for the state where something can be chosen and shown in all of them, so a reader with nothing to
choose was told *"Your credentials are ready — choose the ones you would like"*, and a reader with
nothing waiting at all was told the same thing.

The copy now follows the state — something to add, nothing to add, nothing waiting — and lives in
`quals-frontend/app/lib/issue-copy.js` as a plain module, the way the academy keeps its door copy, so
`scripts/check-issue-copy.mjs` can assert it without a browser. Two assertions in particular: **no state
is ever asked to choose from nothing**, and **nothing waiting is never reported as readiness**. This
screen has been corrected by eye twice, which is the argument for the check.

## The consequence, stated plainly

The document is handed over **once**, in the response to the wallet's claim. If that response is lost
after the server has recorded the issue, the wallet has nothing and the issuer has nothing to send,
so the holder must ask the institution again. That is the price of keeping nothing, and it is a price
worth naming rather than discovering: the alternative is holding every issued document for some
window in case a network drops, which is the thing this story exists to stop.

## Reversal of P0-24

P0-24 gave a holder another copy on request, from the link they already had. That is now refused, and
its tests are rewritten to assert the refusal. The reason is the sentence above it: a credential the
institution no longer holds cannot be re-sent, only re-issued, and re-issuing is the institution's
act. A link with no expiry on how often it can mint is a link that issues credentials for ever.
