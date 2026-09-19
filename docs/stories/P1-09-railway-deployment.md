# P1-09: The system runs on Railway

**Priority:** P1. The demo has to be reachable without a laptop running it
**Status:** Deployed and verified. Four items remain, listed below
**Components:** `railway.json` (removed), `scripts/prepare-signer-keys.mjs`, `docs/deployment/railway.md`, `.env.example`

## What was deployed

One Railway project, `Cred-issuer`, holding six services built from this repository. Each service
uses the repository root as its Root Directory, because the workspaces share one lockfile, and what
makes them different is the command they run.

| Service | Address |
| --- | --- |
| issuer | https://issuer-production-335e.up.railway.app |
| verifier | https://verifier-production-ef03.up.railway.app |
| academy | https://academy-production-8262.up.railway.app |
| my-jobs | https://my-jobs-production.up.railway.app |
| portal | https://portal-production-a8a5.up.railway.app |
| trust-university | https://trust-university-production.up.railway.app |

A volume is mounted at `/data` on the issuer, so the database and the share records outlive a
redeploy. The verifier keeps no database of its own.

## What was verified on the running deployment

- Every service answers over HTTPS. The issuer and the verifier both return `{"status":"ok"}` from
  `/health`, and all four sites return 200.
- The academy's `/api/health` reaches the **issuer** and My Jobs' reaches the **verifier**, which is
  what proves the two proxy variables are pointing at the right services.
- The issuer serves `/status-list/quals-1`, so the revocation address written inside a credential
  resolves to something real.
- An administrator can sign in through the portal. The session route returns the administrator, the
  httpOnly cookie opens the proxied admin routes, and the user list shows both seeded accounts.
- The volume holds. The organisation row written by the first deployment, at 19:00:57, was still
  there after the redeploy that created the accounts at 19:14:08.
- `/.well-known/assetlinks.json` answers 404 with its own explanatory message, which is the correct
  state until the wallet's fingerprint is supplied.

## Decisions taken, and why

**The root `railway.json` was deleted.** Railway applies that file to every service built from the
repository, so the issuer's start command in it would have been forced on the verifier and on all
four front-ends. The commands belong to the service.

**The front-ends build with `npm ci --include=dev`.** `NODE_ENV=production` makes npm skip
devDependencies, and a Next build needs TypeScript and the CSS tooling, which live there. Without the
flag the failure reads like a code error rather than a missing dependency.

**The signing keys travel as variables, not in the repository.** The private keys are gitignored, so a
build from the repository has never had them: without this the issuer would start with no signer.
`scripts/prepare-signer-keys.mjs` writes them from `MDOC_SIGNER_KEY_PEM` and
`WALLET_TOKEN_SIGNER_KEY_PEM` onto the volume before the service starts, and the pairing of each key
with its certificate was checked before the first deploy.

**`STATUS_LIST_BASE_URL` was set before anything was issued.** It is written inside every credential
as the address a verifier fetches to check revocation. A credential carrying a localhost address can
never be checked by anyone and cannot be corrected afterwards.

**The administrator accounts were created with generated passwords.** Leaving them unset means the
issuer starts, logs `[admin-auth] No administrator exists`, and offers no way in. The addresses are
placeholders (`admin@transcript.local`, `registrar@transcript.local`) and the passwords are temporary.

## What is still open

1. **Email.** The Brevo key and sender are set on the issuer, and the provider refuses every send: it
   answers `401` because the deployment's outbound address is not on the account's authorised list.
   The fix is in the Brevo account, not in this code. Either allow the address it names in the
   refusal, or turn the restriction off. Note that Railway's outbound address is not fixed, so an
   allowlisted address can stop matching when the service moves; a static egress address is the
   durable version of that option. The code logs the refusal in full, so the cause is never a
   mystery.
   The academy flow depends on the one-time code, so it cannot be walked end to end until a send
   succeeds. What the failure looks like from the outside is worth knowing: the request still
   succeeds, the item is prepared, and the page offers the claim link instead, which is why the
   fallback wording says the email could not be sent rather than claiming email is unconfigured.
   Note too that a share carries a link and the issuer logs that link when a send does not happen,
   so a share can still be followed by hand. A sign-in code is sent as text in the body of the
   message, so nothing in the log recovers it. Local development is unaffected, because with
   `NODE_ENV` unset the issuer accepts a development code. Production deliberately does not, and
   should not be changed to: that flag lets anyone sign in as anyone.
2. **The administrator passwords.** They must be changed from the placeholders, and the addresses to
   real ones. The seeded account is not recreated when the variables change, so a new password is set
   in the portal rather than in the dashboard.
3. **Android App Links.** `/.well-known/assetlinks.json` held the fingerprint of the debug keystore
   on the machine that built the wallet, which covers a build installed from Android Studio. A
   release build needs its own fingerprint added to the same variable, comma separated.
4. **The wallet release.** It must be built against these addresses with a signing key, which is not
   in the repository:
   `./gradlew assembleRelease -PissuerBaseUrl=<issuer> -PwalletAppLinkHost=<academy-host>`.

## Two things found while setting this up

**The App Link file was frozen at build time.** Next evaluated the route once during the build and
served that answer from then on, so setting the fingerprint on a running deployment changed nothing
and the file kept replying that it was not configured. It now reads the environment per request.

**Stripe keys have nowhere to go.** They were offered, and nothing in this repository reads them.
The only payment in the system is the simulated checkout for the identity document fee, which
records a status and calls no provider. They were deliberately not set: a key in an environment that
no code reads is a liability with no upside. Wiring a real provider is its own story.

## Known limits of this deployment

- **One instance per service.** SQLite means two processes writing one file would corrupt it. Postgres
  is the first thing to do if this stops being a demo.
- **No backups.** A Railway volume is persistent, not backed up.
- **Deploys are uploads.** A project token can deploy but cannot connect a repository. Connecting the
  repository in the dashboard, and installing the Railway GitHub App, is what turns this into a deploy
  on every push.
- **No issuer certificate pinning on the verifier.** `TRUSTED_ACADEMIC_ISSUER_SHA256` is unset, so the
  verifier trusts the certificate chain rather than one pinned fingerprint.

## Acceptance criteria

- Every service answers over HTTPS from outside the network, and `/health` reports healthy. Met.
- A redeploy keeps the database: the volume survives and a second deploy does not start from empty.
  Met, and demonstrated by two rows with timestamps either side of a redeploy.
- `git grep` finds no private key material, and the prepare step is the only thing that writes keys to
  disk. Met.
- A credential claimed at the academy verifies at the verifier and appears in the portal, with email
  configured. Blocked on item 1, which needs a Brevo key.
