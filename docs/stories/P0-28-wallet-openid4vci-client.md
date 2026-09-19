# P0-28 — Wallet claims credentials the standard way

**Status:** Done (issuer and wallet)
**Depends on:** P0-27 (assessment), the issuer-side OpenID4VCI surface

## Why

An issuer that publishes OpenID4VCI metadata can be claimed from by *any* conformant wallet, and a
wallet that speaks it can claim from *any* conformant issuer. Until now both halves of this wallet
were bespoke: our own offer shape, our own claim endpoint, our own session id.

## What was built

### Issuer (`issuer-service/src/openid4vci.js`)

- `/.well-known/openid-credential-issuer` and `/.well-known/oauth-authorization-server`, built from
  the same claim catalogue the wallet shows, so the issuer's names for its claims are published
  rather than hard-coded by a client.
- Pre-authorized code grant: single-use codes, access tokens with a lifetime, `nonce_endpoint`,
  `credential_endpoint` requiring a `openid4vci-proof+jwt` bound to the holder's key, one-shot nonces,
  and a `notification_endpoint` whose events land in the issuer's audit log.
- Offers advertise `credential_configuration_ids` alongside the legacy fields, so old and new
  wallets can both read the same offer.

### Wallet (`mobile-wallet .../data`)

- `Oid4vci.kt` — reads a Credential Offer and issuer metadata from text, and builds the proof of
  possession (`ES256`, raw `r||s`, carrying the device's public JWK).
- `IssuerClient` — metadata, token, nonce, credential and notification calls, driven entirely by the
  URLs the issuer publishes.
- `WalletRepository.claim` — an offer that parses as a standard offer with a pre-authorized code is
  claimed through the standard flow; anything else falls through to the existing path. No behaviour
  change for offers already in the wild.
- The credential is bound to the device key the proof named, stored under a wallet-minted id, and
  the issuer is notified that it was accepted — best effort, since the holder already has it.

## Verification

- Issuer: 96 tests (15 new, HTTP level against the real app).
- Wallet: 58 tests (8 new) — offer parsing, non-standard offers falling through, metadata and claim
  labels, the proof verifying against its own key, and credential-response parsing.
- `scripts/check-openid4vci.mjs` walks the full flow against a running issuer as a conformant client
  would, including replay refusal and notification.

## Not done, and why

Phase 2 — transferring the *offer* over DCAPI instead of a QR code — is blocked on the platform:
`androidx.credentials:1.5.0` ships no issuance API (only passkeys, passwords and presentation), so
there is nothing in the Android credential manager for an issuer to hand an offer to. QR stays
first-class until that changes.
