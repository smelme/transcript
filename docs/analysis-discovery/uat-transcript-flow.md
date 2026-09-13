# UAT — Transcript credential flow (exploratory pass and cleanup iteration)

**Date:** 2026-02 (iteration 1)
**Mode:** exploratory UAT — route inventory, then evidence-driven checks on the running system
**Scope:** the four web applications and the two APIs that make up the demo: Smart Academy
(`issuer-frontend` :3002), My Jobs verification (`verifier-frontend` :3003), Quals portal
(`quals-portal` :3004), Trust University admissions (`trust-university-frontend` :3007), issuer
service (:3000), verifier service (:3001).
**Out of scope:** the Android wallet UX on device (covered separately by the device-test pass),
values and labels owned by the academy (P0-21), and load or security penetration testing.

## Assumptions

- The demo is still a demo, but it is now shown to institutions, so "enterprise level" here means
  the things an IT or admissions reviewer would notice in the first ten minutes, not a production
  hardening programme.
- Anything an institution owns as a value (names, codes, calendars) is deliberately left as a
  placeholder; those are tracked as open questions in
  `docs/analysis-discovery/transcript-model-facts.md`, not treated as defects here.
- Where a check could only be completed with a device or a browser, it is recorded as not exercised
  rather than assumed to pass.

## Coverage

| Journey / area | How it was checked | Result |
| --- | --- | --- |
| Academy: choose → claim → add to wallet | Source read, live page fetch, existing end-to-end checks | Pass (findings UAT-010) |
| Academy: claimable-credential reuse across requests | Live reproduction of the reported student case | Pass — 1 superseded, claim link carries the requested kind |
| My Jobs: verify for My Jobs, trusted issuers | Live page fetch, source read | Pass (findings UAT-005, UAT-003) |
| Trust University: apply with a presented transcript | Live page fetch, source read | Pass (findings UAT-009) |
| Portal: credentials, audit, shares, API keys | Source read, live page fetch (login screen) | Pass (findings UAT-006, UAT-003, UAT-011, UAT-014) |
| Response headers on all four web apps | HTTP fetch, all four hosts | **Fail → fixed in this iteration (UAT-001)** |
| Response headers on both APIs | Source read | Pass — `helmet()` on both services |
| Accessible names for inputs and controls | Source audit of every `<input>` in the three frontends | **Fail → fixed (UAT-003)** |
| Keyboard access: skip link, focus visibility | Source audit of the four layouts and stylesheets | **Fail → fixed (UAT-007, UAT-008)** |
| Repository hygiene: secrets, build output, scaffold dirs | `git ls-files`, ignore rules, private-material scan | Mixed (UAT-004, UAT-012) |
| CI: can a fresh checkout build? | Workflow read, lockfile and workspace existence check | **Fail → tracked as P1-02 (UAT-002)** |
| Device: present a transcript, wallet card labels | Not exercised in this pass | Deferred to the device run |

### Verified clean (no action)

- No private key, certificate or `.env` file is tracked (`git ls-files` filtered: zero matches), and
  the live signing key `key-management/keys/mdoc-signer.private.pem` is correctly gitignored.
- No build output is tracked: zero tracked paths under `dist/`, `.next/`, `build/` or `node_modules/`.
- Both APIs already set `helmet()` defaults, so the missing headers were a web-app issue only.
- Test suites green on the day of the pass: 76 issuer, 61 verifier, 27 wallet.
- All four web apps render and return 200.

## Findings

Severity: **Blocker** (stops a journey), **High** (breaks trust or accessibility for a real user),
**Medium** (visible inconsistency or dead end), **Low** (polish, or a risk that is not user-facing).

### UAT-001 — No security headers on any of the four web applications

- **Severity:** High
- **Journey / page:** every page of all four apps
- **Trigger:** any HTTP request
- **Observed:** none of `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` or a framing CSP were returned by :3002, :3003, :3004 or :3007.
- **Expected:** an institutional reviewer sees the baseline headers a security questionnaire asks
  about, and the pages cannot be framed by another site.
- **Business impact:** a clickjacked consent screen would let a third party drive a wallet
  presentation on a user's behalf; the absence is also the first thing a technical due-diligence
  review flags.
- **Cause:** no `headers()` hook existed in any Next config.
- **Recommendation / status:** **fixed** — shared policy in `shared-web/security-headers.mjs`,
  applied by all four configs. The CSP deliberately enforces only the directives that cannot break
  a rendered page (`frame-ancestors`, `base-uri`, `object-src`); a full `script-src` policy depends
  on how the production build inlines scripts, which is P1-01's territory.
- **Evidence:** before — no headers on any host; after — all four return `nosniff`, `DENY`,
  `strict-origin-when-cross-origin`, `camera=(self), microphone=(), geolocation=()` and the CSP.

### UAT-002 — A fresh checkout cannot install or build

- **Severity:** High
- **Journey / page:** CI, and any onboarding developer
- **Observed:** `package-lock.json` is gitignored while CI runs `npm ci`, so the install step fails
  before any test; the workflow also names a workspace directory that does not exist in the
  repository.
- **Expected:** `git clone` followed by CI succeeds.
- **Business impact:** the pipeline reports nothing useful and the project cannot honestly be
  described as continuously integrated.
- **Cause:** the lockfile was added to `.gitignore` for a local-only workflow; the workflow
  meanwhile kept `npm ci`.
- **Recommendation / status:** **deferred** to P1-02 (extended with the missing workspace name).
  Not fixed here because committing a lockfile changes every future dependency diff and should be a
  deliberate decision.

### UAT-003 — Search and control inputs have no accessible name

- **Severity:** High
- **Journey / page:** portal credentials search and filters; portal "revoke" and "stop sharing"
  dialogs; My Jobs trusted-issuers trust slider
- **Trigger:** screen reader, or any user who cannot see the placeholder
- **Observed:** the credentials search relied on its placeholder alone for a name; two modal reason
  fields were preceded by a `<label>` that was not associated with the input; the trust-score slider
  had no name at all.
- **Expected:** every input is announced with a name that survives being cleared or typed into.
- **Business impact:** a registrar using assistive technology cannot use the credential search — the
  primary portal task.
- **Cause:** labels written as visual text next to the field, not bound to it.
- **Recommendation / status:** **fixed** — `aria-label` on the search field and the slider,
  `htmlFor`/`id` on both reason fields, plus `aria-label` on the credentials table.
- **Evidence:** source audit of every `<input>` in the three frontends; the remaining inputs already
  have bound labels.

### UAT-004 — Stale private key material sitting in the working tree

- **Severity:** High
- **Journey / page:** developer and build environment
- **Observed:** `archive/keys/signer-key.pem` and `archive/keys/signer-cert.pem` exist on disk in an
  untracked directory. The key is not the one currently in use (that is
  `key-management/keys/mdoc-signer.private.pem`, correctly ignored), and nothing tracked references
  it.
- **Expected:** superseded keys are removed from working trees, or clearly marked as retired.
- **Business impact:** an old private key is a liability: it may still verify something, it can be
  committed by accident, and it makes the answer to "where are the keys?" ambiguous.
- **Cause:** a previous key layout was left behind when keys moved to `key-management/keys`.
- **Recommendation / status:** **deferred** to P1-05 (a decision, not a code change: delete the
  directory, or move it into the documented archive location with the key blanked).
  Deliberately not deleted unilaterally — it is an untracked file in the user's working tree.

### UAT-005 — The verification app is called two different names

- **Severity:** Medium
- **Journey / page:** My Jobs — navigation, and the app title
- **Observed:** the header and metadata say "My Jobs"; the primary navigation link said "Verify for
  MyJob". The relying-party identifier in the presentation sessions is `myjob`, and the verifier
  frontend sends `https://myjob.example` as its origin.
- **Expected:** one display name, with any internal identifier documented as such.
- **Business impact:** small, but it is exactly the kind of detail that makes a reviewer wonder which
  name is the product.
- **Cause:** the nav label was typed from the identifier.
- **Recommendation / status:** **fixed** — nav link is now "Verify for My Jobs". The relying-party
  id and origin are **left unchanged on purpose**: they are protocol-level identifiers bound into
  issued presentation sessions, so renaming them would invalidate stored sessions and is a
  deployment-time decision. Component names and element ids that read `MyJob` are internal only.

### UAT-006 — The portal credentials page over-claims its scope

- **Severity:** Medium
- **Journey / page:** portal → Credentials
- **Observed:** the subtitle read "Every credential this issuer has created, and its current
  lifecycle state", while an organisation-scoped administrator only sees their own credentials.
- **Expected:** the subtitle describes what this user is looking at.
- **Business impact:** a registrar at one institution reads a claim of network-wide visibility and
  concludes either that the numbers are wrong or that the portal is not scoped as promised.
- **Cause:** a single subtitle written for the platform-admin case.
- **Recommendation / status:** **fixed** — the subtitle is now scope-aware: platform administrators
  see "Every credential issued across the network…", organisation administrators see the name of
  their own institution.

### UAT-007 — No way to skip the navigation with a keyboard

- **Severity:** Medium
- **Journey / page:** all four web apps
- **Observed:** every page begins with a navigation bar; keyboard and screen-reader users had to
  traverse it on every page load, with no skip link.
- **Expected:** a "Skip to content" link as the first focusable element, targeting the main region.
- **Business impact:** keyboard users repeat the same tab sequence on every page; the tab order is
  the first thing an accessibility reviewer tests.
- **Cause:** layouts were built without one.
- **Recommendation / status:** **fixed** — skip link and matching `id="main"` target on all four
  apps. The portal login screen is intentionally excluded: it renders outside the shell, has no
  navigation, and the login card is the only content.

### UAT-008 — Focus visibility was inconsistent and mostly absent

- **Severity:** Medium
- **Journey / page:** all four web apps
- **Trigger:** tabbing through any page
- **Observed:** only one app styled `:focus-visible`, and only for its nav links; everywhere else the
  focus indicator was whatever the browser default happened to be, over a themed background.
- **Expected:** one consistent, high-contrast focus ring.
- **Business impact:** a keyboard user can lose their place, which is worse on white-on-colour
  buttons.
- **Cause:** no shared focus rule.
- **Recommendation / status:** **fixed** — a global `:focus-visible` rule in all four stylesheets,
  in each app's own accent colour.

### UAT-009 — Trust University's "About" link leaves the site for a code repository

- **Severity:** Medium
- **Journey / page:** Trust University → header
- **Observed:** the "About" item in the primary navigation linked to
  `https://github.com/openwallet-foundation/multipaz`.
- **Expected:** either no "About" item, or an about page for the institution being demonstrated.
- **Business impact:** an admissions reviewer clicking "About" lands on a source repository, which
  reads as an unfinished demo and leaks the implementation story into a user-facing flow.
- **Cause:** the link was a placeholder carried from the scaffold.
- **Recommendation / status:** **fixed** — the item is removed rather than pointed somewhere
  invented. Navigation is now "Apply" and "How it works", both of which exist on the page.

### UAT-010 — Academy empty state points at a body that does not exist

- **Severity:** Medium
- **Journey / page:** Smart Academy → claim
- **Trigger:** claim with an email that has no credentials
- **Observed:** the message told the user to "contact the academy registry".
- **Expected:** the message should say what the user can actually do.
- **Business impact:** a dead end during the demo's most likely failure — a mistyped address — and a
  support request that cannot be answered.
- **Cause:** copy written before the demo had a real contact point.
- **Recommendation / status:** **fixed** — the message now explains that credentials can only be
  claimed at the address the academy holds on the record.

### UAT-011 — The demo database makes the portal claim credentials are "In wallet"

- **Severity:** Low
- **Journey / page:** portal → Credentials; academy → claim
- **Observed:** on a shared development database the issuance-session table accumulates rows, so a
  credential can appear claimed by a wallet that never held it. This is what produced the earlier
  device-test confusion.
- **Expected:** a demo reset path, so a tester starts from a known state.
- **Business impact:** testers chase phantom credentials; it looks like a bug in claim-aware reuse
  when it is leftover data.
- **Cause:** no seed or reset script for the development database.
- **Recommendation / status:** **deferred** to P1-03.

### UAT-012 — Scaffold directories and a stale build output directory

- **Severity:** Low
- **Journey / page:** repository
- **Observed:** `generator`, `schema`, `signature-validator`, `verifier-qr-scanner`,
  `verifier-registry`, `wallet-qr-receiver` and `mobile-wallet-native` exist with no tracked content
  (four contain a stray untracked `package-lock.json`), and `verifier-frontend/dist/` holds a stale
  bundle from the earlier Vite implementation.
- **Expected:** the tree reflects the system, and a workspace name in CI refers to something real
  (this is what breaks P1-02's workflow).
- **Business impact:** onboarding time, and a CI definition that cannot run.
- **Cause:** directories were emptied during the Next.js migration without being removed.
- **Recommendation / status:** **deferred** to P1-04.

### UAT-013 — Demo sites are indexable

- **Severity:** Low
- **Journey / page:** all four web apps
- **Observed:** no `robots.txt` and no `noindex` directive. Sample credentials, a demo portal and a
  fictional university can be crawled and appear in search results.
- **Expected:** demo deployments are not indexed.
- **Business impact:** a fictional institution surfacing in a search engine is confusing at best,
  and it advertises a demo that accepts real-looking personal data.
- **Cause:** nothing was added for a demo deployment.
- **Recommendation / status:** **deferred** to P1-06.

### UAT-014 — Dates are shown in two different shapes

- **Severity:** Low
- **Journey / page:** portal (credentials and audit), academy claim and share views
- **Observed:** some values are rendered as raw ISO strings (`2026-02-14T09:31:00.000Z`, and the
  wallet-relevant `YYYYMMDD` claim dates) next to locale-formatted timestamps in the same table.
- **Expected:** one human-facing format, with machine formats reserved for values that must stay
  machine-readable.
- **Business impact:** slightly harder to read, and a reviewer may read a raw ISO date as a bug.
- **Cause:** some screens format, others print the value that was stored.
- **Recommendation / status:** **deferred** to P1-06.

## Cleanup iteration delivered

| Finding | Change | Verified by |
| --- | --- | --- |
| UAT-001 | `shared-web/security-headers.mjs` + `headers()` in all four Next configs | HTTP fetch of all four hosts shows every header |
| UAT-003 | Accessible names on the search field, the trust slider and both reason fields; table label | Source audit of every `<input>`; `tsc --noEmit` clean |
| UAT-005 | Navigation label "Verify for My Jobs" | Source read; relying-party id documented as unchanged |
| UAT-006 | Scope-aware credentials subtitle | Source read against the session helper |
| UAT-007 | Skip link + `id="main"` on all four apps | Fetched pages contain the skip link |
| UAT-008 | Global `:focus-visible` in all four stylesheets | Source read |
| UAT-009 | "About" (GitHub) removed from the Trust University navigation | Fetched page no longer links out |
| UAT-010 | Claim empty-state copy rewritten | Source read |

Regression checks after the changes: issuer 76/76, verifier 61/61, `tsc --noEmit` clean for both
TypeScript apps, all four sites restarted from a clean environment and returning 200 with the new
headers.

## Decision

**Partial pass.** No journey is blocked: the academy choose → claim → present → verify path works,
the credential kind is honoured end to end, and the earlier device-test defects (stale prepared
credentials, dashes in place of study detail) are fixed and verified. The open items are one
deliberate deferral that needs a decision rather than code (committing a lockfile, UAT-002), one
that touches untracked files in the working tree (UAT-004), and the demo-grade polish tracked as
P1-03, P1-04 and P1-06. Nothing recorded here is a release blocker for showing the flow to an
institution; UAT-002 and UAT-004 are the two that should be closed before anyone else joins the
project.

---

# Iteration 2 — the deferred items, worked through

Every finding above except the two that need a product decision has now been closed, and closing
them turned up more than the findings themselves listed. The work is on `refactor`; the stories in
`docs/stories/` carry the detail.

| Finding | Outcome |
| --- | --- |
| UAT-002 / P1-02 | Lockfiles committed; the two workflows replaced by one that runs. See below — it was much worse than "cannot install". |
| UAT-004 / P1-05 | Archived key pair confirmed unused (`sha256 FAC18A22…` ≠ the live certificate) and deleted. |
| UAT-011 / P1-03 | `npm run db:reset` and `npm run db:seed`, both guarded against production and against a database outside the repository. |
| UAT-012 / P1-04 | Seven directories holding nothing but `node_modules` and a stray lockfile removed (203 MB reclaimed), stale `dist/` removed. |
| UAT-013 / P1-06 | `X-Robots-Tag: noindex, nofollow` on all four apps plus a `robots.txt` each; `/.well-known/` allowed so App Links verification still works. |
| UAT-014 / P1-06 | One date shape wherever a person reads one — the share view, the shared PDF and the verification result — and date claims normalised to `YYYY-MM-DD` at the verifier's API boundary. |
| UAT-001, 003, 005–010 | Closed in iteration 1. |

## What the "cannot install" finding actually hid

`ci.yml` was **not valid YAML** — a line in a block scalar was indented short, closing the scalar
early, and `ci-cd.yml` had two `run:` keys in one step. Nothing in either workflow could ever have
executed, so no other failure had ever been reported. Behind that: three workspaces installed
separately with `npm ci` in an npm-workspaces monorepo, one of them a directory that does not exist,
branch filters pointing at `main` while the default branch is `master`, and a `cd.yml` that this
finding referenced but which was never in the repository.

Three further breakages then had to be fixed before a pipeline could mean anything:

- **The production build** (P1-01) — the real cause was two React majors in the tree: React 18.3.1
  hoisted to the root for Next's peer requirement, with React 19.2.8/19.3.0 nested per app. Only a
  clean install from a committed lockfile resolves it, which is why it was untestable before.
- **`lint` failed in every workspace** — `linebreak-style: unix` against a working tree rewritten to
  CRLF by `core.autocrlf=true`. A `.gitattributes` now states the convention, the rule is off, and
  the genuine remainder (dead code, unused imports, `==`, a function declared inside a block, two
  Express error handlers whose required fourth parameter was flagged) is fixed.
- **`next lint` no longer exists in Next 16**, so three apps failed with "Invalid project directory
  provided". The JSX apps now run `eslint app`; the two TypeScript apps run `tsc --noEmit`, because
  ESLint here has no TypeScript parser — a real check rather than a placeholder.

`START_LOCAL_SERVICES.ps1` also claimed "150/150 tests, 100% SUCCESS" without running a single test,
and named ports 5173/5174 and a deleted directory. It is replaced by a launcher that starts the six
real services and reports which came up.

## Verification (iteration 2)

Run in the order CI runs them, on a clean install from the committed lockfile:

| Check | Result |
| --- | --- |
| `npm ci` at the root, and in `devops` and `e2e-integration-tests` | Succeeds |
| Lint, all seven workspaces | Exit 0 |
| Unit tests | 10 + 76 + 61 pass, 0 fail |
| Production builds, four Next apps | All succeed; `robots.txt` route present in each |
| End-to-end scenarios, nine scripts, throwaway database | All nine exit 0 |
| Security headers and `robots.txt` on the running sites | Present on all four |
| `db:reset` / `db:seed`, including both refusal guards | Behave as specified |

## Notes for the next pass

- A local `issuer-service/.env` (gitignored, holding a real Brevo key) changes whether the demo can
  sign anyone in, because the one-time code is only returned when the send *fails*. This cost real
  time here: the whole scenario suite failed on a freshly reset database and looked like a
  regression. Recorded as P1-08; the launcher now forces the development path and says so.
- `docs/DEVELOPMENT.md`, `LOCAL_DEPLOYMENT.md`, `SETUP.md`, `QUICKSTART.md` and `CONTRIBUTING.md`
  still describe PostgreSQL and Keycloak, which this system does not use, and the container images
  cannot build against the workspace layout. P1-07. The `README.md` front door now describes the
  system that exists, with an explicit "Not built yet" section.
- The scenario scripts and the two extra issuer instances (3005, 3006) still need a published
  convention for environment variables: `PORT`, `NODE_ENV` and `DATABASE_PATH` leaking from a shell
  silently redirect a child process, which is how one earlier failure looked like a port collision.

