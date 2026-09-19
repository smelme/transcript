# Deploying to Railway

Six services run from this one repository. Every service uses the **repository root** as its Root
Directory, because the workspaces share a single lockfile: installing inside a workspace folder finds
no lockfile of its own. What makes them different services is the start command.

## Services to create

Create these six, each from this repository, each with Root Directory left at the repository root.

| Service | Build command | Start command | Public |
| --- | --- | --- | --- |
| `issuer` | `npm ci` | `node scripts/prepare-signer-keys.mjs && node issuer-service/src/index.js` | yes, the wallet talks to it |
| `verifier` | `npm ci` | `node verifier-service/src/index.js` | yes |
| `academy` | `npm ci --include=dev && npm run build -w issuer-frontend` | `npm run start:railway -w issuer-frontend` | yes, students use it |
| `my-jobs` | `npm ci --include=dev && npm run build -w verifier-frontend` | `npm run start:railway -w verifier-frontend` | yes |
| `portal` | `npm ci --include=dev && npm run build -w quals-portal` | `npm run start:railway -w quals-portal` | yes, administrators use it |
| `trust-university` | `npm ci --include=dev && npm run build -w trust-university-frontend` | `npm run start:railway -w trust-university-frontend` | yes |

There is deliberately **no `railway.json` in the repository**. Railway applies that file to every
service built from the repository, so a shared one would force the issuer's start command on the
verifier and on all four front-ends. The commands above belong to the service, which is where they
differ, and they go in the service settings rather than in the repository.

All four front-ends are Next.js applications. Their `start` scripts pass a fixed port, as in
`next start -p 3002`, which is right for local work and useless here: Railway assigns a port and
expects the service to bind it. Each app therefore carries a `start:railway` script that runs plain
`next start` and lets Next read `PORT`. Use that one on Railway.

The `--include=dev` on the front-end builds is not decoration. `NODE_ENV=production` makes npm skip
devDependencies, and these builds need them: TypeScript, the CSS tooling and the type packages all
live there. Without the flag the build fails in a way that reads like a code error.

## The addresses this deployment uses

The project is at https://railway.com/project/74a6a770-5a74-4132-95f7-a222dcff64a3.

| Service | Address |
| --- | --- |
| `issuer` | https://issuer-production-335e.up.railway.app |
| `verifier` | https://verifier-production-ef03.up.railway.app |
| `academy` | https://academy-production-8262.up.railway.app |
| `my-jobs` | https://my-jobs-production.up.railway.app |
| `portal` | https://portal-production-a8a5.up.railway.app |
| `trust-university` | https://trust-university-production.up.railway.app |

Two of these are written into things that outlive them. The issuer address is stamped inside every
credential as the place a verifier checks revocation, and the academy address is baked into the
wallet at build time. Changing either later means reissuing credentials or rebuilding the wallet,
so treat them as fixed and attach your own domain in front of them instead.

Railway supplies `PORT` and both Node services already read it, so do not set it by hand.

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

### On each front-end

Every app proxies `/api/*` to a service and reads that service's address from the environment. Left
unset, each one proxies to localhost and fails in a way that looks like the service is down.

| Service | Variable | Value |
| --- | --- | --- |
| `academy` | `ISSUER_API_URL` | `https://<issuer-domain>` |
| `portal` | `ISSUER_API_URL` | `https://<issuer-domain>` |
| `my-jobs` | `VERIFIER_API_URL` | `https://<verifier-domain>` |
| `trust-university` | `VERIFIER_API_URL` | `https://<verifier-domain>` |

### On `issuer` only, for the administrators

| Variable | Value |
| --- | --- |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the platform administrator |
| `ACADEMY_ADMIN_EMAIL`, `ACADEMY_ADMIN_PASSWORD` | the Smart Academy registrar |
| `ACADEMY_NAME` | `Smart Academy` |

The first of these has a development default, so set it explicitly. It is the account that can
manage every organisation. Until it is set the issuer starts and logs
`[admin-auth] No administrator exists`, and no one can sign in to the portal.

#### What the running deployment uses

It uses `admin@transcript.local` and `registrar@transcript.local`, with generated passwords. The
passwords live in the Railway variables `ADMIN_PASSWORD` and `ACADEMY_ADMIN_PASSWORD`, where the
dashboard can reveal them, and they are also recorded in `transcript-credentials.txt` on the machine
that created the deployment. Both addresses are placeholders and both passwords are temporary:
change them once you have signed in, before anyone else is given access.

### On `issuer` only, the signing keys

The private keys are **not in the repository** and must not be. They arrive as variables and are
written onto the volume by `scripts/prepare-signer-keys.mjs`, which runs before the service starts.

| Variable | Value |
| --- | --- |
| `MDOC_SIGNER_KEY_PEM` | the contents of `key-management/keys/mdoc-signer.private.pem` |
| `WALLET_TOKEN_SIGNER_KEY_PEM` | the contents of `key-management/keys/wallet-token-signer.private.pem` |
| `MDOC_SIGNER_KEY_PATH` | `/data/keys/mdoc-signer.private.pem` |
| `WALLET_TOKEN_SIGNER_KEY_PATH` | `/data/keys/wallet-token-signer.private.pem` |

The matching certificate, `key-management/keys/mdoc-signer.cert.der`, **is** in the repository, and
the issuer reads it from there by default. Check that the key and the certificate are a pair before
trusting a deployment with them: if they are not, issued credentials cannot be verified, and it is
the kind of fault that shows up at the end of a demo rather than at the start.

Newlines in a pasted key are preserved. If a tool flattens them to a literal `\n`, the prepare step
puts them back.

### On `issuer` only, the rest of what the deployment sets

| Variable | Value | Why |
| --- | --- | --- |
| `SHARE_DATA_DIR` | `/data/shares` | share records are kept in a file, so they need the volume too |
| `ISSUER_FRONTEND_URL` | `https://<academy-domain>` | the address share links point at |
| `WALLET_APP_LINK_BASE` | `https://<academy-domain>/offer` | the same offer offered as an Android link |
| `APP_BASE_URL` | `https://<issuer-domain>` | used by the identity document checks |
| `VERIFIER_API_URL` | `https://<verifier-domain>` | the issuer names the verifier when it makes a share |
| `CORS_ORIGINS` | all six addresses, comma separated | who may call the service from a browser |

The verifier reads `CORS_ORIGINS` and `ISSUER_URL` too. Leave either unset and it falls back to
localhost, which shows up as a verification that fails for no visible reason.

### On the wallet's build

The wallet is not deployed to Railway, but it must be built to point at it:

```
./gradlew assembleRelease \
  -PissuerBaseUrl=https://<issuer-domain> \
  -PwalletAppLinkHost=<academy-host>
```

Both are baked in at build time. A build pointed at `127.0.0.1` works in the emulator and nowhere
else. It needs a release signing key too, which is not in this repository.

The academy serves `/.well-known/assetlinks.json`, which Android checks before it opens the wallet
from a link. It answers 404 until `ANDROID_APP_SHA256` is set on the academy service to the SHA-256
fingerprint of the certificate the wallet is signed with. Set it in the same breath as building the
release, or tapping a link opens the browser instead of the wallet.

## How a deploy happens

### Today, from a machine

Deploys are uploads, which is what a project token is for:

```
npx --yes @railway/cli up --service <service> --ci
```

A project token can do that and very little else. It cannot create a project or its services, and it
cannot connect a repository, which is why those steps are done in the dashboard or through the API
with a token that has workspace access.

### Automatic deploys on push

Connecting the repository is a one-off action: install the Railway GitHub App for `smelme/transcript`
in the Railway dashboard, then point each service at the repository and the branch to follow. After
that a push builds and deploys what it affects, and the upload step above is no longer needed. Do it
before anyone else starts pushing, so that deploys and the repository cannot drift apart.

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
5. Check that the issuer answers over HTTPS from outside. `https://<issuer-domain>/health` should
   return `{"status":"ok"}`, and `https://<issuer-domain>/status-list/<status-list-id>` should return
   a signed list rather than time out.

There is no OpenID4VCI metadata document. That work was rolled back deliberately, so
`/.well-known/openid-credential-issuer` does not exist and its absence is not a fault.

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
