# Addresses and endpoints

A snapshot of what is deployed and what each part answers. The route lists are taken from the
source at the time of writing, and the source remains the thing to trust if the two ever disagree.

## The six services

| Service | Address | Open this in a browser |
| --- | --- | --- |
| `issuer` | https://issuer-production-335e.up.railway.app | no, it is an API. `/health` and `/status-list/quals-1` are the readable ones |
| `verifier` | https://verifier-production-ef03.up.railway.app | no, it is an API. `/health` is the readable one |
| `academy` | https://academy-production-8262.up.railway.app | yes, students |
| `my-jobs` | https://my-jobs-production.up.railway.app | yes, an employer verifying |
| `portal` | https://portal-production-a8a5.up.railway.app | yes, administrators |
| `trust-university` | https://trust-university-production.up.railway.app | yes, an admissions officer |

`/health` answers on the two Node services only. The academy and My Jobs return 404 for it, which is
correct. The portal answers `200` for **any** path, including nonsense ones, so a 200 there says
nothing about whether a route exists.

## The academy site

| Page | What it is |
| --- | --- |
| `/` | the front door |
| `/get-credentials` | the student flow: email, code, choose what to take, take it |
| `/claim` | where an emailed link lands, listing what belongs to that address |
| `/credentials` | what the issuer has prepared |
| `/share/<shareId>` | the page a share recipient opens |
| `/.well-known/assetlinks.json` | Android App Link verification, rewritten to `/api/assetlinks` |

Its `/api/*` is proxied to the issuer, so the browser only ever talks to this site.

## The portal

| Page | What it is |
| --- | --- |
| `/login` | sign in as an administrator |
| `/` | overview |
| `/credentials` | issued credentials |
| `/shares` | shares and their state |
| `/accounts` | wallet accounts |
| `/api-keys` | client API keys |
| `/audit` | the audit log |
| `/api/session` | sign-in, sign-out and who am I. Sets the httpOnly cookie |
| `/api/*` | proxied to the issuer with the administrator's token. Refuses without the cookie |

## My Jobs

| Page | What it is |
| --- | --- |
| `/` | front door |
| `/dashboard` | verification activity |
| `/issuers` | who issued what has been seen |
| `/verify-academic` | verify an academic credential |

Its `/api/*` is proxied to the verifier.

## Trust University

One page, `/`. Its `/api/*` is proxied to the verifier.

## Issuer API

Base `https://issuer-production-335e.up.railway.app`.

### Service

| Method | Path |
| --- | --- |
| GET | `/health` |
| GET | `/status-list/:listId` |

### Credentials

| Method | Path |
| --- | --- |
| POST | `/credentials/issue` |
| GET | `/credentials` |
| GET | `/credentials/:id` |
| GET | `/credentials/student/:studentId` |
| DELETE | `/credentials/:id` |
| GET | `/credentials/:id/qr` |
| GET | `/credentials/:id/mdoc` |
| GET | `/statistics` |
| GET | `/audit-log` |

### Holder accounts and sign-in

| Method | Path |
| --- | --- |
| POST | `/invitations` |
| POST | `/otp/verify` |
| POST | `/auth/otp` |
| POST | `/auth/token` |
| POST | `/auth/refresh` |
| POST | `/auth/signout` |

### Administration

| Method | Path |
| --- | --- |
| POST | `/admin/auth/login` |
| POST | `/admin/auth/logout` |
| GET | `/admin/auth/me` |
| POST | `/admin/auth/password` |
| GET | `/admin/users` |
| POST | `/admin/users` |
| POST | `/admin/users/:id/active` |
| GET | `/admin/orgs` |
| GET | `/admin/api-keys` |
| POST | `/admin/api-keys` |
| DELETE | `/admin/api-keys/:keyId` |
| GET | `/admin/accounts` |
| POST | `/admin/accounts/:sub/deactivate` |
| POST | `/admin/accounts/:sub/activate` |
| POST | `/admin/accounts/:sub/delete` |

### The academy flow

| Method | Path |
| --- | --- |
| POST | `/academy/requests` |
| GET | `/academy/credentials` |
| POST | `/academy/credentials/:sessionId/offer` |

### Issuance sessions and claiming

| Method | Path |
| --- | --- |
| POST | `/issuance-sessions` |
| POST | `/issuance-sessions/:id/consent` |
| POST | `/issuance-sessions/:id/checkout` |
| POST | `/issuance-sessions/:id/payment/confirm` |
| GET | `/issuance-sessions/:id/offer-qr` |
| POST | `/issuance-sessions/:id/claim` |
| POST | `/wallet/issuance` |

### Shares

| Method | Path |
| --- | --- |
| POST | `/shares` |
| GET | `/shares` |
| DELETE | `/shares/:id` |
| POST | `/shares/:id/response` |
| POST | `/shares/:id/otp` |
| POST | `/shares/:id/verify` |
| POST | `/shares/:id/accept-terms` |
| POST | `/shares/:id/view` |
| GET | `/shares/:id/pdf` |

## Verifier API

Base `https://verifier-production-ef03.up.railway.app`.

| Method | Path |
| --- | --- |
| GET | `/health` |
| GET | `/presentation/reader-key` |
| POST | `/presentation/sessions` |
| POST | `/presentation/sessions/:id/response` |
| POST | `/verify/scan` |
| POST | `/verify/mdoc` |
| GET | `/verify/verification/:id` |
| POST | `/verify/verification/:id/reject` |
| GET | `/verify/verifications` |
| GET | `/verify/statistics` |
| POST | `/registry/verifiers` |
| GET | `/registry/verifiers` |
| GET | `/registry/verifiers/:id/trust-score` |
| POST | `/registry/verifiers/:id/approve` |
| PUT | `/registry/verifiers/:id/trust-score` |
| POST | `/registry/verifiers/:id/block` |
| GET | `/audit-log` |

## Trying one by hand

```
curl https://issuer-production-335e.up.railway.app/health
curl https://issuer-production-335e.up.railway.app/status-list/quals-1
curl https://verifier-production-ef03.up.railway.app/health
```

The status list is a signed token rather than JSON, which is what a verifier fetches to check
revocation. It answering at all is the thing to check, not what it contains.
