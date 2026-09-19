# Using DCAPI to transfer the credential offer — assessment

Question asked: *is there a standard for issuing mdoc over DCAPI, and what would have to change to
use it instead of our own QR code?*

Checked against the source specifications on 2026-09-19:

- **OpenID for Verifiable Credential Issuance 1.0**, OpenID Foundation, **Final**, 16 September 2025
- **Digital Credentials API**, W3C Federated Identity WG, **Working Draft**, 4 September 2026
- Android Credential Manager documentation (issuance pages **404**, see "Unknowns")

## Short answer

**There is no settled standard for issuing over DCAPI yet — but the shape is visible, and the
protocol underneath it is final.**

Two separate things get called "DCAPI", and they are at very different stages:

| | Presentation | Issuance |
|---|---|---|
| Spec | `navigator.credentials.get()` — **final** in OpenID4VP 1.0 | `navigator.credentials.create()` — W3C **Working Draft** |
| Protocol ids | `openid4vp-v1-unsigned/signed/multisigned`, `org-iso-mdoc` | `openid4vci-v1` (the only value) |
| Browser requirement | MUST support all listed presentation protocols | issuance protocols are only **RECOMMENDED** |
| What we have | **Implemented** — `PresentationActivity`, `org-iso-mdoc` | not implemented |

The decisive detail: in the W3C draft's own protocol table, `openid4vci-v1` points at *"OpenID for
Verifiable Credential Issuance 1.0 § **Coming Soon** — ISSUE: API Integration"*. The protocol
identifier exists; **the payload the issuer sends and the wallet returns is not yet written down**.
And OpenID4VCI 1.0 final says of offers: *"Credential Issuers MAY also communicate Credential Offers
directly to a Wallet's backend, but any mechanism for doing so is currently outside the scope of
this specification."*

So: we can build this today against a draft whose `data` shape is an open issue, or we can
standardise the protocol underneath it — which is final, testable, and useful on its own. The
second is worth doing first, and it is a prerequisite for the first anyway.

## What the DC API would look like, as far as it is defined

```js
// Feature-detect, then ask the user agent to run the issuance, with the QR as fallback.
if (typeof DigitalCredential === 'undefined' ||
    !DigitalCredential.userAgentAllowsProtocol('openid4vci-v1')) {
  showQrFallback();                       // what we do today
} else {
  const credential = await navigator.credentials.create({
    digital: { requests: [{ protocol: 'openid4vci-v1', data: { /* ← undefined today */ } }] },
  });
}
```

Three properties worth knowing, all from the draft:

- It needs **transient activation** (a real user gesture) and a **secure context**.
- The response the *page* gets is the protocol's response — "does **not** represent the actual
  issued digital credential itself". The page learns the outcome; the wallet keeps the credential.
- Iframed issuance needs the `digital-credentials-create` permissions policy, separate from
  `digital-credentials-get`.

The draft also defines a WebDriver BiDi module (`digitalCredentials.setVirtualWalletBehavior`) for
simulating a wallet — which would let us test this in CI rather than by hand.

## What the standard issuance protocol is, and where we differ

OpenID4VCI 1.0's pre-authorized code flow, and what `issuer-service` does today:

| OpenID4VCI | Today | Notes |
|---|---|---|
| Credential Offer: `credential_issuer`, `credential_configuration_ids`, `grants` | Offer exists, with `credential_issuer`, a **bespoke** `issuer_id` and `credentials: [docType]` | Right mechanism (by value, `openid-credential-offer://`), wrong payload |
| `nonce` belongs to the token/credential request | `nonce` sits **inside** the grant object | A standard wallet would ignore it and fail later |
| `/.well-known/openid-credential-issuer` metadata | **absent** | No discovery: endpoints, supported credentials, display |
| Token Endpoint: exchange pre-authorized code for an access token | **absent** — we reuse the academy wallet-account token | This is the biggest structural difference |
| Credential Endpoint: `credential_configuration_id` + `proofs` (`jwt` proof-of-possession with `aud` + `c_nonce`) | bespoke `POST /wallet/issuance` with a bespoke CWT | Our claim path works, but only our wallet can use it |
| `mso_mdoc` format profile: `doctype` + `cose_key` binding | `org.iso.23220.photoid.1` mdoc, device-bound | Already conformant in substance |
| Notification Endpoint (`credential_accepted` / `credential_deleted`) | absent | Would give the issuer real delivery confirmation |

Two things worth noticing:

- **We are closer than it looks.** The cryptography is mdoc over ISO 18013-5, device-bound, with
  selective disclosure and status lists — the part that is hard. What is missing is the OAuth-shaped
  envelope around it.
- **The display metadata we just hand-drew into the wallet is in the standard.**
  `credential_configurations_supported[].credential_metadata.display[]` carries `name`, `logo.uri`,
  `background_color`, `text_color` and per-claim display names. That is the honest answer to "use
  logos and institution colours": if the issuer publishes them, the wallet renders them — instead of
  the wallet carrying a hard-coded table for five institutions.

## What would have to change

### Phase 1 — standardise the issuance protocol (final spec, worth doing regardless)

1. **Publish issuer metadata** at `/.well-known/openid-credential-issuer`: `credential_issuer`,
   `credential_endpoint`, `nonce_endpoint`, `notification_endpoint`, and
   `credential_configurations_supported` with a `mso_mdoc` entry (`doctype:
   org.iso.23220.photoid.1`) plus `credential_metadata.display` — the card name, colours and logo,
   and the claim labels the wallet currently hard-codes.
2. **Fix the Credential Offer** to use `credential_configuration_ids` and move `nonce` out of the
   grant. Keep `reissue: true` — extra parameters are allowed and other wallets must ignore them.
3. **Add a Token Endpoint** that exchanges the pre-authorized code for an access token, with
   `pre-authorized_grant_anonymous_access_supported` so an unauthenticated wallet can use it. The
   academy's own sign-in flow stays as an alternative, not a requirement.
4. **Add the Credential Endpoint** (`POST /credential`): `credential_configuration_id` plus
   `proofs.jwt` — a proof-of-possession JWT with `aud` = issuer, `nonce` = `c_nonce`, `jwk` = the
   device key we already generate and bind. Return `credentials[].credential` = base64url mdoc —
   which is already exactly what we produce.
5. **Add the Notification Endpoint** and send `credential_accepted` from the wallet. Cheap, and it
   turns "we emailed them a link" into "the wallet confirmed it stored it".
6. **Keep `/wallet/issuance`** as a compatibility path while the wallet moves over.

Payoff: any conformant wallet can claim from Smart Academy, and the issuer/wallet contract stops
being ours alone. This is all against a **final** specification.

### Phase 2 — the DC API offer transfer (draft; behind a flag)

7. **Academy page**: `navigator.credentials.create()` guarded by the `typeof DigitalCredential`
   check and `userAgentAllowsProtocol('openid4vci-v1')`, with the **QR code as the fallback** — the
   draft recommends exactly this, and the QR is what we keep for browsers that do not support it.
8. **Wallet**: a second credential-provider entry point for **issuance**, sibling to the presentation
   one that already works (`PendingIntentHandler`/`CreateDigitalCredentialRequest`), reading the
   offer out of `data` and running the same Phase-1 flow.
9. **Pin the draft.** Because `data` is unwritten, the payload shape must be isolated behind one
   adapter so it can be re-pointed without touching the claim logic.

## Risks and unknowns

- **The `data` payload is an open issue in the draft.** Anything we build is provisional; this is
  the main reason to do Phase 1 first and Phase 2 behind a flag.
- **Browser support is not a given.** Issuance over DC API is RECOMMENDED, not required, for user
  agents — so the QR and app-link paths must stay as first-class, not fallbacks in name only.
- **Android-side issuance API unverified.** The `developer.android.com` issuance pages I tried both
  404'd, so I have **not** confirmed `CreateDigitalCredentialRequest` and friends exist in the
  `androidx.credentials` version the wallet builds against, nor what Android version they require.
  This needs checking before Phase 2 is estimated.
- **Wallet-side UX is platform-owned.** With DC API, the chooser and the save prompt belong to the
  OS, so our own claim screen stops being the interface for this path. That is a product change, not
  just a protocol one.

## Recommendation

Do **Phase 1** — it is final-spec work with concrete wins (interoperability, issuer-published
branding and claim labels, delivery notifications, and a wallet that no longer needs a hard-coded
institution table). Then **prototype Phase 2** behind a flag, keeping QR as the default until the
draft's payload is written and browser support is real. Treat "transfer the offer over DCAPI" as a
2027-horizon change, not a swap we can make now.
