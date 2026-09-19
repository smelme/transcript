# P0-32 — Content and visual consistency pass

**Status:** Wave 1 done; wave 2 open
**Depends on:** nothing; informed by `docs/analysis-discovery/content-and-visual-audit.md`

## Problem

Four front-ends and an app had grown separately. The copy turned out to be in good shape; the
presentation did not: four stylesheets, four headers, two sites with no logo, and a brand accent
that was gold on the academy, blue on the verifier, indigo on the portal and navy at Trust
University. Nothing looked *wrong*; nothing looked related.

## Decision

Two kinds of surface, differing in exactly one way:

- **Quals surfaces** (wallet, academy, verifier, portal) carry the product identity — gold with a
  green companion, on a shared neutral, radius and type foundation. The palette's origin is the
  wallet's theme, because that is where a holder meets the product first.
- **Institutional surfaces** (a university's own site) keep their own brand colour and share
  everything else — the same distinction the wallet already draws when it paints a credential in its
  institution's colours.

Written up in `docs/design/design-system.md`, with the one hard rule: **gold is a fill, never text,
and never with white on top of it.**

## Wave 1 (done)

- The four copy findings from the audit; three fixed, one flagged and left (the academy's hero).
- The verifier's blue → violet identity became gold → green, with text-on-brand moved to dark ink
  and its blue-tinted dark neutrals made green-tinted to match the wallet.
- The portal's mark lost its violet half.
- The academy and Trust University were left alone: the first already contains the palette the
  others are being aligned to, the second is an institution and keeps its own colour.

## Wave 2 (open)

- The portal's interactive primary colour: indigo is neither in the family nor obviously right for
  an admin console, but moving it to gold is a stylesheet pass, not a value swap (text on gold must
  become dark ink first).
- One header and one footer shape across the four sites.
- One type scale across the four sites.
- Read every page end to end for what a string sweep cannot catch: labels, captions, error
  messages, and whether each page has one clear purpose and one primary action.

## Acceptance criteria

- Any two Quals surfaces, side by side, look like the same product at different jobs.
- No combination in use falls below a readable contrast ratio — checked, not assumed.
- No institution's identity is flattened into the product's.
- A page has one job and one primary action.
