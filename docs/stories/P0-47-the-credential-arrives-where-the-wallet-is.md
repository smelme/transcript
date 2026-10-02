# P0-47: The credential arrives where the wallet is

**Status:** ✅ Done — 2026-09-27
**Components:** `quals-frontend` (the collecting step), new `app/lib/device.js` and
`scripts/check-wallet-entry.mjs`
**Depends on:** P0-42 (one item per programme), P0-44 (the record, not the document)
**Blocks:** nothing

## Why

The collecting screen offered both ways at once: a QR code the size of a credit card, and under it a
button reading *Open in the Quals wallet*, introduced by a sentence that said "scan this with your
Quals wallet, or open it directly if the wallet is on this device".

That sentence asked the reader to work out which of the two applied to them, and the page could
already see the answer. Offering both also put the wrong one first on each device: on a phone the
reader has to ignore a large QR code to find the button, and on a desktop the button opens nothing at
all while sitting above the code that is the only way through.

## What the screen does now

**On a phone that has the wallet** — *Add to wallet* is the action, with **Show QR code** beside it.
Pressing it reveals the code and says what it is for: *wallet on a different phone? Scan this with that
one instead.* A phone carrying one wallet is precisely the case where the wallet is on somebody's other
phone, so the code stays one tap away rather than gone. Moving to the next credential hides it again:
the code on screen has been used, and leaving it up invites the wrong one being scanned.

**Everywhere else** — the code, and nothing else. A desktop has no wallet to open, so it gets the one
thing that works. A phone whose browser did not supply a wallet link falls back here too, rather than
being left with a button that does nothing.

The two ways in are the same offer either way: the link opens the wallet, the code encodes the same
offer for a wallet elsewhere.

## Deciding which

The decision lives in `looksLikePhone()` rather than in three lines inside the page, because getting it
wrong is quiet — a phone shown a code it cannot scan, or a laptop offered a link that opens nothing —
and a function can be checked without a browser. Three signals, in the order they can be trusted:

| Signal | Why |
| --- | --- |
| `userAgentData.mobile` | Chrome states it outright. A browser willing to answer is worth more than anything parsed out of a user agent string. |
| The user agent | A mess, but `iPhone`, `Android`, `iPad` and the rest say enough. |
| A coarse primary pointer | What is left for an iPad, which reports itself as a desktop Macintosh: the touchscreen is the only honest thing about it. |

An absent answer is `null` rather than `false`, because *I do not know* and *no* are not the same, and
only a definite answer is allowed to override the string. It is read **after mount**, never while
rendering: the answer exists only in the browser, and arriving at it during render would be a guess the
server and the browser could disagree about.

A touchscreen laptop lands on the phone side. That is the harmless direction to be wrong in: it is
offered the button, and the code is one tap behind it.

## Verification

`node scripts/check-wallet-entry.mjs` — five checks over the decision: a phone is offered the wallet it
is holding; a desktop is offered the code; an iPad counts as a phone while the same string with a mouse
does not; a browser that states whether it is mobile is believed over its own user agent; and no
combination of absent signals turns a desktop into a phone.
