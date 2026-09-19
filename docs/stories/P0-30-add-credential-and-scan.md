# P0-30 — Two ways in: add credential, or scan

**Status:** Done
**Depends on:** P0-29 (the scanner that can tell codes apart)

## Problem

One screen tried to be two things. "Receive credential" was a page — a heading, an explanation, and
a button — whose only job was to open a camera. It also assumed the holder had a **QR code**, when
the institution's invitation arrives as a **link**, and the wallet's own deeplink path already
claimed those without ever showing that screen.

## Decision

Split it by what the holder actually has:

- **Scan** — a reader, and nothing else. Tapping it opens the camera immediately: no page, no
  explanation, no second tap. It reads a code, decides what it is, and acts (P0-29's classifier).
  A result that needs saying is said in one line, with the camera offered straight back.
- **Add credential** — takes the link. Pasting is the realistic way a link arrives on a phone, so
  there is a field, a *Paste from clipboard* action (read only on tap), and one primary button.
  The wallet's own deeplink lands here too and claims on arrival without any typing.

A link that is not an offer is named as such *before* it is sent anywhere, which beats "invalid
credential offer" as an answer.

## The one place I kept something on screen

A claim is a network round trip, and it can fail for reasons the holder has to act on — an offer
already claimed, terms not accepted, payment outstanding. So the reader keeps a **single-line
progress and outcome state**, not a page: "Adding your credential…", or the issuer's own reason
with *Scan again*. Same for a deeplinked link that fails. Without it, a failed claim would look
exactly like a successful one until the holder noticed the credential was missing.

## Acceptance criteria

- Tapping Scan opens the camera with no intermediate screen.
- A claimed offer lands on the credential list; a FIDO code is handed to the system; anything else
  is explained in a line and the camera comes back.
- Cancelling the camera is not reported as an error.
- Add credential accepts an offer URL, an App Link offer, or a bare session id, and refuses
  anything else by name.
- The wallet's own deeplink still claims without typing.
- `ScannedCode` remains the only piece of this that needs unit tests, and it has them.

## Not in this story

- Multi-code scanning in one sitting (queue several codes without leaving the reader). Plausible for
  a registrar handing out printed codes; not asked for yet.
