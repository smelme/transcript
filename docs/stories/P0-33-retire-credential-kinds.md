# P0-33 — Should credential kinds be retired?

**Status:** Open — needs a product decision, not a cleanup
**Raised by:** "there is no kind anymore, it's one credential"

## The finding

The credential *kind* taxonomy is not dead code. It is a live, student-facing choice, and the
evidence is specific:

| Where | What it does |
| --- | --- |
| `issuer-frontend/app/get-credentials/page.tsx:29` | `useState<CredentialChoice>('qualification')` — a **picker** on the student's own page |
| `issuer-frontend/app/claim/page.tsx:26-33` | maps the choice to namespaces: `both`, `transcript`, `qualification` |
| `issuer-service/src/credential-generator.js:274` | `requestedKinds(include)` decides which claim blocks the document carries |
| `issuer-service/tests/issuer-service.test.js` | **44 assertions** covering the three shapes |
| wallet `AcademicNamespaces` / `PresentationEligibility` | derives which blocks a credential holds, for share sections and presentment |

What *is* true is that the issuer mints **one document**: a request for both produces a single
credential holding the qualification and the transcript, and the wallet filters by namespace at
presentation. So the taxonomy survives as *contents*, not as separate documents — which is exactly
why the wallet's own comment in `CredentialRegistry.kt:111` says "one kind now, so the kind label
said nothing a holder could act on" and drops the label from the chooser.

**So the statement that prompted this is half right**, and the half that is right has already been
acted on in the wallet. Deleting the rest is a product change, not a cleanup, and it would remove a
choice students currently have.

## The decision to make

1. **Keep kinds** (recommended if the picker is wanted): then nothing is removed. The only tidy-up
   worth doing is calling the concept what it is — *contents* rather than *kind* — in the places
   that still say "kind" to a reader: the portal's credentials column, the audit table, and the
   share page's badge.
2. **Retire the issuance choice** — always issue the combined credential, and let presentation
   filter by namespace as it already does. This is coherent, and cheap in the wallet (it already
   treats one kind as the norm); it is *not* cheap in the issuer or the academy.

## Work if retired

- `credential-generator.js`: `requestedKinds`, `CREDENTIAL_KINDS`, the per-kind record mapping, and
  `DEFAULT_KIND` collapse to one shape. `kindOfCredentialData` / `labelOfCredentialData` keep the
  values they are given, or go.
- `issuer-service/tests/issuer-service.test.js`: 44 assertions to rewrite, including the ones that
  assert a rejection for an unrecognised `include`.
- Academy: the picker on `get-credentials`, and the namespace mapping on `claim`.
- The portal's kind column, the audit table and the share badge and email copy.
- Existing credentials: nothing. The document is already what it is; only the labels change.
- `issuer-service/scripts/test-academy-flow.mjs` and `smoke-share-transcript.mjs` assert the
  transcript-only path and would need updating.

Estimate: a focused day, most of it in tests and the academy's copy, with the risk that a student
who wanted a transcript-only credential no longer gets one — unless presentation-time filtering is
explained in the offer's own words.

## Recommendation

Ask the registrar whether a student should still be able to receive a transcript on its own. If yes,
keep the machinery and do the naming tidy-up. If no, retire it deliberately — with the issuer's own
smoke scripts updated in the same change, since they are the only place the old promise is written
down.
