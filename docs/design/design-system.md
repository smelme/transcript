# Design system — one family across the app and the sites

**Date:** 2026-09-19
**Status:** Wave 1 applied; wave 2 open

## The rule

There are two kinds of surface here, and they are allowed to differ in exactly one way.

**Quals surfaces** — the wallet, the academy, the verifier and the management portal — carry the
product's identity: **gold `#ffc400`** as the brand, **green `#1b9c5b`** as its companion, and a
shared neutral, radius and type foundation beneath them.

**Institutional surfaces** — a university's own site — keep *their* brand colour, because they are
not Quals; they are a university using it. Everything else about them is shared. This is the same
distinction the wallet already makes on its cards, where a credential is drawn in its institution's
colours rather than the wallet's.

The origin of the palette is the wallet's own theme (`QualsTheme`), since the app is where a holder
first meets the product.

## The tokens

| Token | Value | Meaning |
| --- | --- | --- |
| brand | `#ffc400` | The product's accent. On light backgrounds it is a *fill*, never text. |
| brand-dark | `#e0a800` | Hover/pressed states of the above. |
| brand-light | `#ffd633` | The accent on dark backgrounds. |
| accent (companion) | `#1b9c5b` | The second half of any gradient. Never a primary. |
| accent-light | `#5bd496` | On dark backgrounds. |
| link / brand-ink | `#8a6d00` | Gold is unreadable as text; links use this instead. |
| on-brand | `#111111` | Text and icons sitting **on** brand gold or green. Not white. |

Gold and white is the one combination to avoid: `#ffc400` with `#ffffff` is about 1.6:1, which is
not readable. The academy had already worked this out — it uses `#8a6d00` for links and `#111111`
for text on gold — and that discipline is now the estate's.

## Applied in wave 1

- **Copy** — four findings from the content audit, three of them fixed (demo-speak in the academy's
  footer line, "matched" → "checked" on Trust University's disclosure summary, and a wordy
  description of the issuer's signature). The academy's hero headline was flagged and deliberately
  left alone.
- **Verifier** — its blue → violet identity became gold → green, with `--on-grad` moved to `#111111`
  so text on it stays readable; its dark theme's blue-tinted neutrals became green-tinted ones
  matching the wallet's dark palette. This was the largest single mismatch in the estate.
- **Portal** — the mark's violet half became the companion green, so the logo no longer introduces a
  colour that appears nowhere else.

## Open in wave 2

- **The portal's interactive primary colour.** Its brand is indigo, which is neither in the family
  nor obviously wrong for an administrative console. Moving it to gold is not a value swap: every
  place it puts text on gold has to move to dark ink first, or the contrast gets worse rather than
  better. That needs a pass over its stylesheet, not a find and replace.
- **Shared header and footer markup.** The academy and the verifier were clearly cut from one
  template and have since drifted; the portal and Trust University were written separately. Three
  header shapes for four sites is the remaining structural inconsistency.
- **Type scale.** Each site sets its own sizes. One scale, applied, is what makes pages from
  different codebases read as one hand.
