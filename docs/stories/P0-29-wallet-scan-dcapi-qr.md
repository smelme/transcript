# P0-29 — The scanner understands more than our own QR codes

**Status:** Done
**Depends on:** nothing; presentation already works through the system credential manager

## Problem

The wallet's scanner assumed every QR code it saw was one of our credential offers. Anything else
failed with *"Invalid credential offer"*, which is wrong for the most likely other thing to be in
front of a wallet: a **presentation request**.

The Digital Credentials API's cross-device transfer code is a **FIDO URL** (`FIDO:/…`). The phone's
camera app does not try to read it — it hands it to whichever app registered for that scheme, and
the system's credential manager takes it from there. Scanning one in our own wallet handed it to a
claim path that was never going to understand it.

## Decision

Classify what was scanned, and act on the class rather than assuming:

| Scanned | Wallet's response |
| --- | --- |
| Our offer (`openid-credential-offer://`, an App Link carrying `credential_offer=`, or a bare session id) | claim it, exactly as before |
| A FIDO URL (`FIDO:/…`) | hand it to the system as the camera app does — no attempt to read it |
| Any other link | say plainly that it is a link, and open it only if the holder asks |
| Anything else | say it is not a credential offer |

The offer tests run **before** the link tests, because our App Link invitations are `https://` URLs
and would otherwise be handed to the browser.

## Why handing a FIDO URL on is right, and not a shrug

We are not the owner of that code. Opening it delegates to whoever registered the scheme, and the
credential manager then asks the wallet to answer the request as a **provider** — which is how
`PresentationActivity` is reached for a cross-device presentation. Reading it ourselves would mean
reimplementing a transport we do not need to own.

## Acceptance criteria

- Scanning an offer claims it; scanning a FIDO URL leaves the wallet (and comes back as a
  presentation if this wallet holds a credential the request will accept).
- A FIDO URL that nothing on the phone handles says so, rather than failing silently or crashing.
- `fido` appearing inside some other URL is not mistaken for a FIDO URL.
- An App Link offer is never treated as a web link.
- The classification is pure and unit-tested; nothing about intent handling leaks into it.

## Not in this story

- A QR code on our own verifier page for the cross-device case. Today the browser renders the FIDO
  code for a desktop-initiated request; a self-hosted one is a follow-up.
- Any issuance over the API. Rolled back deliberately — see P0-27.
