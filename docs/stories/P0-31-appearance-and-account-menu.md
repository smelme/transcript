# P0-31 — Appearance setting, and the camera under the account

**Status:** Done
**Depends on:** P0-30

## Problem

Two small things a holder reaches for and could not find:

- The wallet's colours followed the phone with no way to say otherwise. The palette for both was
  already written; only the choice was missing.
- The scanner was only in the title bar. A holder who looks under their account for things found
  nothing there.

## Decision

Both live in the account panel — the expanding panel that already holds the address, what the
wallet holds, and the way out — because both belong to the wallet rather than to a credential:

- **Appearance**: *Device · Light · Dark*, as chips, with **Device** the default and staying the
  default. The phone already knows a choice the holder has made everywhere else; a wallet that
  overrides it is being clever at their expense.
- **Scan a QR code**: the same reader the title bar opens, offered a second time for the holder who
  looks for it here. Nothing new behind it.

## Acceptance criteria

- Choosing Light or Dark applies immediately and survives a restart.
- Choosing Device follows the phone again, including when the phone changes while the wallet is
  running.
- With no choice ever made, the wallet follows the phone.
- The title bar keeps its own way into the scanner; the account panel adds a second.

## Not here

`Appearance` is a preference, so it is stored with the wallet's other settings rather than with the
credential material — it is not encrypted, and it does not need to be. The stored values are stable
strings, so a future choice can be added without invalidating what holders have already chosen.
