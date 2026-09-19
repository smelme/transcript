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

1. **Email.** No Brevo key is configured, so sign-in codes and share notifications are not sent. The
   academy flow depends on the one-time code, so it cannot be walked end to end until this is set.
   Note what that means precisely: a share carries a link, and the issuer logs that link when there
   is no provider, so a share can still be followed by hand. A sign-in code is sent as text in the
   body of the message, so nothing in the log recovers it. Local development is unaffected, because
   with `NODE_ENV` unset the issuer accepts a development code. Production deliberately does not, and
   should not be changed to: that flag lets anyone sign in as anyone.
2. **The administrator passwords.** They must be changed from the placeholders, and the addresses to
   real ones. The seeded account is not recreated when the variables change, so a new password is set
   in the portal rather than in the dashboard.
3. **Android App Links.** `/.well-known/assetlinks.json` answers 404 until `ANDROID_APP_SHA256` holds
   the SHA-256 fingerprint of the wallet's signing certificate. Until then a tapped link opens the
   browser instead of the wallet.
4. **The wallet release.** It must be built against these addresses with a signing key, which is not
   in the repository:
   `./gradlew assembleRelease -PissuerBaseUrl=<issuer> -PwalletAppLinkHost=<academy-host>`.

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
