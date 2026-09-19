# P1-09: The system runs on Railway

**Priority:** P1. The demo has to be reachable without a laptop running it
**Status:** Deployed, verified, and emailing. Two items remain, listed below
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

1. **The administrator passwords.** They must be changed from the placeholders, and the addresses to
   real ones. The seeded account is not recreated when the variables change, so a new password is set
   in the portal rather than in the dashboard.
2. **The wallet release.** It must be built against these addresses with a signing key, which is not
   in the repository:
   `./gradlew assembleRelease -PissuerBaseUrl=<issuer> -PwalletAppLinkHost=<academy-host>`.
   A release build also needs its own App Link fingerprint added to `ANDROID_APP_SHA256`, comma
   separated after the debug one that is there today.

## The email provider, which took two attempts

Sending failed at first with `401 unauthorized`. The cause was not the key or the sender: Brevo has an
authorised-address setting, and the deployment's outbound address was not on it. The refusal named
the address, so there was nothing to guess. It is fixed in the Brevo account.

Two things worth keeping:

- Railway's outbound address is **not fixed**. Allowing the address that was refused works today and
  can stop matching when the service moves. A static egress address is the durable version.
- The address in that refusal was the deployment's, not the developer's machine's, which is why a send
  that works locally can fail once deployed while everything else about it looks identical.

Once a send succeeds the academy flow is complete: the credentials-ready email carries the claim link,
and the sign-in code arrives as a message. The code is not returned in the API response in
production, which is correct, and is why the flow is verified by walking it rather than by reading a
response body.

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
- A credential claimed at the academy verifies at the verifier and appears in the portal. The issuer
  now sends both emails and refuses none, so the remaining dependency is a phone with the wallet on
  it, not the deployment.
