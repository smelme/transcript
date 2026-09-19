# P0-30. Two ways in: add credential, or scan

**Status:** Done
**Depends on:** P0-29 (the scanner that can tell codes apart)

## Problem

One screen tried to be two things. "Receive credential" was a page. A heading, an explanation, and
a button. Whose only job was to open a camera. It also assumed the holder had a **QR code**, when
the institution's invitation arrives as a **link**, and the wallet's own deeplink path already
claimed those without ever showing that screen.

## Decision

Split it by what the holder actually has:

- **Scan**. A camera and nothing else. Tapping it opens the camera on arrival: no page, no
  explanation, no second tap. When it is done it *leaves*: a credential arrives and the holder is
  back where they were, or a link is opened and another app takes over. The outcome travels back
  with them and is said on the screen they came from, so there is no page to dismiss.
- **Add credential**. The guided way in, for a holder who has been **told to scan something**:
  what to do, one button that does it, and then what happened, by name — *your credential from
  Auckland is successfully added* rather than *success*. A link the wallet was opened with is
  claimed on arrival without any of that, since tapping it was following the instruction.

This screen first shipped as a paste-a-link form, which answers a question nobody asked. An
invitation may well arrive by email, but the instruction a holder follows is "scan this", so the
screen is that instruction rather than a URL field.

## The outcomes still have to go somewhere

A claim is a network round trip, and it can fail for reasons the holder has to act on. An offer
already claimed, terms not accepted, payment outstanding. So the outcome is never dropped: the
reader shows *Adding your credential…* while the claim runs, and whatever it has to say afterwards
is handed to the screen the holder returns to and shown there. Without that, a failed claim would
look exactly like a successful one until the holder noticed the credential was missing.

## Acceptance criteria

- Tapping Scan opens the camera with no intermediate screen, and afterwards returns the holder to
  the screen they scanned from, with the outcome shown there.
- A claimed offer lands on the credential list; a FIDO code is handed to the system and the wallet
  steps back; anything else is explained on the screen the holder returns to.
- Cancelling the camera is not reported as an error, in either flow.
- Add credential prompts, opens the camera, names the institution on success, and leaves the prompt
  in place when a scan is cancelled.
- The wallet's own deeplink still claims without typing.
- `ScannedCode` remains the only piece of this that needs unit tests, and it has them.

## Not in this story

- Multi-code scanning in one sitting (queue several codes without leaving the reader). Plausible for
  a registrar handing out printed codes; not asked for yet.
