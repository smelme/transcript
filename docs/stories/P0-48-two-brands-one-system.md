# P0-48: Two brands, one system

**Status:** ✅ Done — 2026-10-03
**Components:** `quals-frontend`, `quals-portal`, `issuer-frontend` (design tokens and copy)
**Depends on:** P0-32 (content and visual consistency), P1-12 (mobile and tablet layout)
**Blocks:** nothing

## Why

Three sites shared one stylesheet, and it showed. Quals, the management portal and Smart Academy's own
site were the same warm cream with the same yellow, so a student who started at the academy and
finished at Quals had no way to tell where one product ended and the other began. A credential service
whose whole claim is that you can tell who issued what cannot look like one undifferentiated site.

They are now two recognisable products built from one system: **Quals in black, yellow and white**, and
**Smart Academy in purple and white**. The components, spacing, type scale and breakpoints are still
shared.

## What was done

- **One token block per app** carries the brand; every other colour in the system refers to it.
- **Yellow is a mark on Quals, purple is a colour at the academy.** `#ffc400` cannot be read as text
  on white at any size, so on Quals it fills, underlines and marks, and never speaks. `#6d28d9` is dark
  enough to be read, which is why academy links can be purple and Quals links are ink with a yellow
  rule beneath them.
- **The hard-coded leftovers went**: the hero gradient that faded into an olive belonging to no brand,
  the yellow glow on a chosen card, a yellow statistic that could not be read, the portal's logo mark
  fading into green, and its indigo login wash.
- **Enterprised the details**: neutral greys instead of cream, rounded rectangles instead of pills, a
  visible focus ring on both light and dark surfaces, and underlined prose links.
- **The copy was rewritten for the reader** on both landing pages, the requesting wizard and the
  collecting screen: the wizard lost about a third of its words, "cryptographically signed" and
  "tamper-evident" became plain speech, "Verifiable credentials" became "Digital credentials", and
  "checking with the identity provider" became "checking your document".

## Why it is not just a colour change

Two of the changes are accessibility fixes rather than taste. The dark sidebar's muted text sat at
3.3:1 against its background, under AA for small text, and is now 4.6:1. And a statistic figure painted
in brand yellow was 1.9:1 on white — decoration reading as content. Both are legible now, which is also
what makes the pages look considered rather than merely coloured.

## The mark, fixed after looking at the pages

The redesign left the site wearing a yellow-to-green square with a Q in it: a shape that appears
nowhere in the app, in a blend of two colours the app does not blend. Being told it "still looks the
same as the old one" was fair — the one thing on every page had not changed.

The wallet's own mark is a **green shield with a white check**, and its palette is **gold first, green
second**: `QualsGold #FFC400`, `QualsGreen #1B9C5B`, `#0B0F0C` for its black. So:

- the site's mark is drawn from the app's own `ic_quals_logo.xml` geometry, and the same file is
  served by the public site and the portal so the two cannot drift apart unnoticed;
- the green joins the tokens as `--brand-alt`, carrying the shield and the accents rather than being a
  second brand;
- **a confirmed record is marked in the app's green** (`#0e6b3d` on `#e2f7ec`) instead of an unrelated
  one, so "confirmed" looks the same in the wallet as on the site;
- `--ink` is the app's `#0b0f0c`, because two blacks that almost match are worse than either;
- the browser tab gets the wallet's launcher icon, black field and all.

The collecting and requesting pages stopped looking untouched at the same time: both cards carry the
gold rule the hero has, both headers gave up a heavy black rule for a hairline now that the mark beside
it carries the weight, and the wordmark is larger.

## Verification

- `npx next build` clean in all three apps.
- The deployed stylesheet is grepped for each site's brand token and the served HTML for the new copy,
  so a palette that failed to deploy is caught rather than assumed.
- Handoff note: `docs/ui-development/two-brand-design-system-ui-implementation.md`.
