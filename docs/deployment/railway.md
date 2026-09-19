# Deploying to Railway

Six services run from this one repository. Every service uses the **repository root** as its Root
Directory, because the workspaces share a single lockfile: installing inside a workspace folder finds
no lockfile of its own. What makes them different services is the start command.

## Services to create

Create these six, each from this repository, each with Root Directory left at the repository root.

| Service | Build command | Start command | Public |
| --- | --- | --- | --- |
| `issuer` | `npm ci` | `node issuer-service/src/index.js` | yes, the wallet talks to it |
| `verifier` | `npm ci` | `node verifier-service/src/index.js` | yes |
| `academy` | `npm ci && npm run build -w issuer-frontend` | `npm run start -w issuer-frontend` | yes, students use it |
| `my-jobs` | `npm ci && npm run build -w verifier-frontend` | see the note below | yes |
| `portal` | `npm ci && npm run build -w quals-portal` | `npm run start -w quals-portal` | yes, administrators use it |
| `trust-university` | `npm ci && npm run build -w trust-university-frontend` | see the note below | yes |

`verifier-frontend` and `trust-university-frontend` are Vite applications: they build to static files
and need a static server rather than a framework start. If their `package.json` has no `start`
script, serve the build output with `npx --yes serve -s <workspace>/dist -l $PORT`.

Railway supplies `PORT` and both Node services already bind it, so do not set it by hand.

## Environment variables

### On `issuer` and `verifier` together

| Variable | Value | Why |
| --- | --- | --- |
| `NODE_ENV` | `production` | production behaviour |
| `DATABASE_PATH` | `/data/transcript.db` | see the volume note below |
| `STATUS_LIST_BASE_URL` | `https://<issuer-domain>` | **read this warning first** |
| `ISSUER_BASE_URL` | `https://<issuer-domain>` | how the issuer names itself |
| `ACADEMY_SITE_URL` | `https://<academy-domain>` | links in emails point here |

**The one that matters most.** `STATUS_LIST_BASE_URL` is written **inside** every credential when it
is issued, as the address a verifier fetches to check revocation. Its default is localhost. Set it
to the public issuer domain *before you issue the first credential*, because a credential issued
with a localhost address can never be checked by anyone, and it cannot be corrected afterwards
without reissuing.

### On `issuer` only, for email

| Variable | Value |
| --- | --- |
| `BREVO_API_KEY` | your Brevo key |
| `FROM_EMAIL` | the verified sender |
| `FROM_NAME` | `Smart Academy` |

Without these, shares and sign-in codes are not sent and the flows that depend on them stop. Locally
this is deliberate; in a deployment it is a misconfiguration.

### On `issuer` only, for the administrators

| Variable | Value |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the platform administrator |
| `ACADEMY_ADMIN_EMAIL`, `ACADEMY_ADMIN_PASSWORD` | the Smart Academy registrar |
| `ACADEMY_NAME` | `Smart Academy` |

The first of these has a development default, so set it explicitly. It is the account that can
manage every organisation.

### On the wallet's build

The wallet is not deployed to Railway, but it must be built to point at it:

```
./gradlew assembleRelease \
  -PissuerBaseUrl=https://<issuer-domain> \
  -PwalletAppLinkHost=<academy-host>
```

Both are baked in at build time. A build pointed at `127.0.0.1` works in the emulator and nowhere
else. It needs a release signing key too, which is not in this repository.

## The database, and the one-instance rule

The system stores everything in a single SQLite file. Mount a Railway **volume at `/data`** and set
`DATABASE_PATH=/data/transcript.db`, or every deploy starts from an empty database and every
credential already in a wallet stops verifying.

SQLite means **one instance only**. Do not scale the issuer or the verifier beyond one replica: two
processes writing one file will corrupt it. Moving to Postgres is a separate piece of work, and is
the first thing to do if this stops being a demo.

## Before the first credential is issued

1. Set `STATUS_LIST_BASE_URL` and `ISSUER_BASE_URL` to the real issuer domain.
2. Confirm the volume is mounted and `DATABASE_PATH` points at it.
3. Sign in to the portal and change the seeded administrator's password.
4. Set the Brevo variables and send yourself a share, to prove email works.
5. Check that the issuer answers over HTTPS from outside, for example
   `https://<issuer-domain>/.well-known/openid-credential-issuer` should answer rather than time out.

## Why HTTPS is not optional

The wallet presents credentials through the Android credential manager, which requires a secure
context. `localhost` counts as one, which is why development works without a certificate. A public
domain does not, so without TLS the wallet can claim a credential but never present one.

## What this deployment does not include

- **Multiple instances.** See above.
- **The Digital Credentials API for issuance.** Rolled back deliberately: the platform has no
  issuance API yet. Presentation does work.
- **Backups.** A Railway volume is persistent, not backed up. Worth arranging before anyone relies
  on it.
