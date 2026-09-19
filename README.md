# Academic credentials as ISO mDoc

Issue a university qualification or transcript as a verifiable credential, hold it in a mobile
wallet, and let a third party check it, including its revocation status, without calling the
issuing institution.

The credential is an ISO/IEC 18013-5 mDoc, the same signed document format a driving licence uses
in a mobile wallet. It is signed by the issuer, bound to the device, and selectively disclosable:
a verifier receives only the values it asks for and the holder approves.

## What is here

| Path | What it is | Runs on |
| --- | --- | --- |
| `issuer-service/` | Issues credentials, manages their lifecycle, serves every API the apps use | :3000 |
| `verifier-service/` | Requests and verifies presentations, checks revocation fail-closed | :3001 |
| `issuer-frontend/` | **Smart Academy**. The student-facing app: choose, claim, hold, share | :3002 |
| `verifier-frontend/` | **My Jobs**. Verification for an employer or background-check use case | :3003 |
| `quals-portal/` | **Quals**. The management portal: credentials, shares, audit, API keys | :3004 |
| `trust-university-frontend/` | **Trust University**. Postgraduate admissions as a relying party | :3007 |
| `mobile-wallet/` | Kotlin/Android wallet (multipaz) that holds and presents credentials | Android |
| `key-management/` | Key generation, storage and rotation for the signing keys | CLI |
| `mdoc-core.js`, `db.js`, `status-list-core.js` | Shared libraries: mDoc encoding and verification, SQLite persistence, status lists | — |
| `devops/`, `e2e-integration-tests/` | Container definitions and cross-service integration tests | — |
| `shared-web/` | Security headers applied by all four web apps | — |

`docs/` holds the analysis and architecture notes; `docs/stories/` holds the work, one file per
story, with the acceptance criteria each one was built against.

## The credential

Every credential is issued under the docType `org.iso.23220.photoid.1`, which carries the holder's
identity. What makes it a qualification, a transcript or an academic record is the **namespace**:

| Namespace | Holds |
| --- | --- |
| `org.iso.23220.education.qualification.1` | The award: programme, level, field, graduation date, overall mark and its scale |
| `org.iso.23220.education.transcript.1` | The study: programme context, courses and marks, credits, aggregates, outcome |
| `org.iso.23220.education.academic-record.1` | The record as a document: credit hours, averages and quality points, document identity and status |

A student may hold any combination. A verifier asks for the namespace it needs and the wallet offers
credentials that can satisfy it, which is why a registrar asking for a transcript does not receive a
bare qualification certificate.

Values follow **US conventions for now**. A 0–4 GPA, credit hours, CIP programme codes, IPEDS award
levels, Fall/Spring terms. These are defaults, not a design commitment: the model facts that would
replace them are collected in `docs/analysis-discovery/transcript-model-facts.md`.

## Running it

Requires Node.js 20 and npm 10.

```bash
npm ci                 # install every workspace from the committed lockfile
npm run db:reset       # start from an empty database
npm run db:seed        # create the demo organisations and an administrator
./START_LOCAL_SERVICES.ps1
```

`START_LOCAL_SERVICES.ps1` starts the two APIs and the four web apps, then prints the URLs. It
writes logs to `data/`, and `-Stop` shuts everything down.

| Check | Command |
| --- | --- |
| Unit tests | `npm run test --workspaces --if-present` |
| Lint (and type-check for the TypeScript apps) | `npm run lint --workspaces --if-present` |
| Production builds | `npm run build --workspaces --if-present` |
| End-to-end scenarios (needs the services running) | `node issuer-service/scripts/test-academy-flow.mjs` |

The Android wallet is a Gradle project: `cd mobile-wallet && ./gradlew assembleDebug`.

### Environment

Everything needed for a local demo is a default, so no `.env` is required to run the flow:
`BREVO_API_KEY=dev-disabled` skips the email provider and prints the one-time code, and
`ALLOW_DEV_OTP=true` accepts the development code. Set the real values to send real email.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `DATABASE_PATH` | both services | SQLite file; defaults to `data/transcript.db` |
| `PORT` | both services | Defaults to 3000 (issuer) and 3001 (verifier) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | issuer | First platform administrator |
| `ACADEMY_ADMIN_EMAIL`, `ACADEMY_ADMIN_PASSWORD`, `ACADEMY_NAME` | issuer | Optional administrator scoped to the example academy |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | issuer | Transactional email |
| `ALLOW_DEV_OTP` | issuer | Prints the one-time code instead of emailing it |
| `MDOC_SESSION_TTL_SECONDS` | issuer | How long an unsigned credential waits to be collected |

### Signing keys

`key-management/keys/mdoc-signer.private.pem` is the live signing key and is **gitignored**. Every
file under that directory that git tracks is public material or metadata. Rotating the key invalidates
credentials already issued, so treat it as a deliberate operation, not a cleanup.

## Data, and what is not stored

SQLite (`better-sqlite3`, WAL) holds wallet accounts, account links, credential metadata, issuance
sessions, shares, portal administrators, client organisations, API keys and the status-list index.
The **mdoc bytes themselves are never persisted**: a credential exists in the wallet, and the issuer's
ephemeral session for it expires. The portal shows metadata and lifecycle only.

Revocation lives in the signed MSO as a status-list index, so a verifier resolves it from the
credential and the published list. It does not have to trust, or contact, the issuer.

## Not built yet

These are tracked as stories rather than implied by this document:

- **Container images** (`devops/Dockerfile.*`) predate the npm-workspaces layout and cannot build as
  written. They expect a per-workspace lockfile. See P1-07.
- **A hosted deployment** for this repository; the demo runs locally.
- **Values an institution owns**. Real calendars, grading scales and identifiers: P0-21.
- **Older documents** (`DEVELOPMENT.md`, `LOCAL_DEPLOYMENT.md`, `SETUP.md`, `QUICKSTART.md`) still
  describe PostgreSQL and Keycloak, which this system does not use. P1-07 covers bringing them in
  line or removing them.

## Licence

ISC. See `LICENSE`.
