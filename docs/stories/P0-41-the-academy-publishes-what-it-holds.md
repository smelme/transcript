# P0-41: The academy publishes the record it holds

**Status:** ✅ Done — 2026-09-26 (academy side: `npm run test:s048`, 9 tests; issuer side: 138 tests)
**Components:** `issuer-frontend` (server-side publish), `issuer-service` (generator fence),
`issuer-service` (claims validation)
**Depends on:** the registry supplying the record (academy-side story S-047)
**Blocks:** P0-35 (the decision point cannot send anyone to self-service until self-service is real)

## The change

`POST /issuance/invitations` was built for exactly this: the institution sends the holder's address
and the claims, authenticated with its own API key, and the publisher's institution is taken from
the key rather than from the request. It is tested and **nothing calls it**.

What the live path calls instead is `POST /academy/requests`, which **generates** the record with
`credential-generator.js`: the graduation year is picked from a range at random, the modules come
from `DEMO_ENROLMENTS`, and the credits are computed. Every "credential" the self-service path has
produced so far is synthetic.

This story makes the self-service path real, and fences the generator so it can never be mistaken
for a registry again.

| Step | Who | What |
| --- | --- | --- |
| 1 | Smart Academy | looks the holder up in the institution's registry by the address we hold |
| 2 | Smart Academy | builds the claims from the record: programme, level, field, graduation date, modules, credits |
| 3 | Smart Academy (server-side) | calls `POST /issuance/invitations` with its API key, the holder's address and the claims |
| 4 | issuer | holds the claims as an invitation, stamps the institution from the key, and emails the Quals link |
| 5 | Smart Academy | hands the holder over by button, as it does now, with the expiry it already shows |
| 6 | Quals | issues exactly as it does now, because nothing about the collection path changes |

## Decisions taken

**The registry is the only source of claims.** No generated record reaches a real institution. This
is ADR-3, and this story is the one that makes it true on the live path rather than only in theory.

**The API key stays on the server.** The publish call is made from a server route in the academy
app, with the key in its server environment. A key shipped to the browser would be a key handed to
every visitor, and the API's whole point is that the key decides which institution is publishing.

**The generator is fenced, not deleted.** The demo sites need a recognisable record, so it stays
behind an explicit flag that must be set, and it refuses to run for a production institution. A
silent fallback to generated claims is the single most dangerous thing this codebase could do.

**`/academy/requests` remains for the demo sites only.** It is the path the test URLs depend on
today. Rather than deleting it and breaking the demos, it keeps working under the demo flag while
the live path moves to the publish API.

**A repeat request reuses the invitation rather than creating a second one.** The publish API

---

## What was built, and the one place it departs from the plan

| Where | What |
| --- | --- |
| `college/credentials-service.js` | **New** (academy platform). Builds the claims from the record the institution actually holds, and publishes them |
| `college/database.js` | `getAcademicRecordFor()` — programme, level, field, dates and modules in one query |
| `college/server.js` | `POST /v1/registry/publish`, behind the same keyed authentication as the eligibility answer |
| `issuer-service/src/index.js` | `/academy/requests` fenced behind `ALLOW_DEMO_RECORDS`; claims validated on publish |
| `issuer-service/src/credential-generator.js` | `validateAcademicClaims()` — the boundary that turns a quiet mistake into a refusal |
| `issuer-frontend/app/api/publish/route.ts` | **New.** The academy site's server route, so no key is ever in a browser |
| `issuer-frontend/app/get-credentials/page.tsx` | Publishes through the registry instead of asking anybody to generate a record |

**The departure.** Step 3 has *Smart Academy* build the claims and call `/issuance/invitations`.
The claims are in fact built by the institution's own registry — the academy platform — rather than
by the website, and the website's server route asks the registry to publish. Three reasons, and they
are the reason this is a departure rather than an oversight:

1. **The claim fields are facts about a record**, and the record lives in the registry. Building them
   in a website would put a copy of the mapping in a place that cannot see the data it describes.
2. **A transcript needs what each module was worth**, and only the registry knows what it holds. When
   a field is absent, the module that omits it has to be the one that knows it is absent.
3. **The key that names the institution belongs with the institution's own system**, not in a public
   website's bundle.

The website still owns what the story asked of it: it no longer publishes from the browser, and the
holder is handed over by button with the expiry stated.

**What the live path now does differently.** `/academy/requests` invented a record — a graduation
year from a range, modules from a fixture, credits computed. It is now off unless
`ALLOW_DEMO_RECORDS=true`, and it refuses with an explanation naming the publish API instead. The
demo sites keep their generated records by setting that flag deliberately; the live deployments do
not set it, so no generated claim can reach a real institution.

**What is not yet published.** Credits, and therefore the transcript. `course_catalog` holds a fee
per course and nothing in the platform counts credits, so an unheld field is left out rather than
estimated. A graduate currently receives an award credential with no module list; closing that is
the college repository's next story, not something to guess at here.
already reuses prepared sessions by comparing claim sets; this story keeps that behaviour so a
holder who asks twice does not accumulate duplicates.

## What stays the same

- The hand-over screen: one button, the expiry sentence, no countdown, no automatic redirect.
- The invitation's 30-day life, its masked preview and its token rules.
- The collection page on Quals, the code step, the selection, the single terms acknowledgement and
  the QR sequence.
- The claims schema in the issuer service: this story sends it, it does not change it.

## Acceptance criteria

- With the demo flag off, the self-service path either publishes real registry claims or refuses; it
  never falls back to a generated record.
- The claims published name the programme, the level, the field of study, the institution, the
  graduation date and, for a transcript, the modules and the credit total, all read from the
  registry.
- Publishing is refused when the key is missing, unknown or revoked, and one institution's key
  cannot publish as another.
- The response's expiry is the invitation's expiry, and the hand-over screen shows it.
- The API key is never present in any browser-served asset: verified by fetching the deployed
  bundles and searching for it.
- The publish call does not invent a second holder account: repeat requests for one address map to
  one wallet account and one set of prepared sessions.
- A first-time holder and a returning holder both reach the collection page with the same experience.

## Verification

- Unit tests on the claim builder: every field present, dates formatted as the schema expects, a
  transcript row carrying its modules as a JSON string claim.
- A scripted end-to-end against the test sites: sign in on the academy page, assert the invitation
  holds the registry values rather than generated ones, then collect and assert the wallet's claim
  succeeds.
- A test asserting the generator is unreachable when the demo flag is off, and refuses a production
  institution when it is on.
- A deployed-bundle check that the API key does not appear in any client asset.
