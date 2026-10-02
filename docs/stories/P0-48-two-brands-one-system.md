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

## The mark, and the black field, fixed after looking at the pages

Two corrections, both of them mine.

**The mark was wrong twice.** The app's mark is `quals_logo`, which its own code describes as "the
Quals brand mark (white Q)": a white Q with a gold tail. The site first carried a yellow-to-green
square with a Q, then a green shield — and the app has no green shield. Both of the app's themes put the
Q on `@color/quals_pure_black`, so the site and the portal now serve that Q, the tab icon is the
launcher icon, and the field behind it is black exactly as the app gives it one.

**The site was the inverse of the app.** Its `windowBackground` is pure black, its surfaces are
near-black, and gold is the colour it acts with: cursors, focus, field labels, buttons, links. A white
page with gold accents is that photograph's negative, which is why the two never looked like one
product however carefully the tokens were aligned. **Quals is now black, with gold and white** — the
dark set is the brand rather than an option.

Green left with the shield. The app keeps it as an untouched Material slot (`secondary`, `tertiary`),
which is a slot rather than a brand, so the site uses it only as the status colour on a badge, where
confirmed and refused have to be told apart.

Two things the black field broke, found by reading the stylesheet rather than by looking at it:
browser-drawn placeholders are the browser's own grey and were unreadable on black, and every checkbox
and radio took its tick from the ink token — black on black on this brand. Both are gold now.

**Then the mark itself was replaced again, with the artwork the product owner supplied:** a white Q
whose tail is a hand, in gold. The site serves it as `quals-mark.svg`, the portal draws it inline, and
the app carries the same geometry as a vector drawable in place of the raster logo it used to load — so
the mark is readable and redrawable from the repository rather than a binary nobody can edit.

**The centring, and a better drawing.** The first pass at that artwork was drawn by eye, and it showed:
the mark looked off-centre on the phone while the layout was already correct, because the drawing sat
about five units right and two down of the middle of its own box, and every surface centres the box
rather than the ink. The product owner then supplied a better version, and this one was traced from its
pixels instead — bounds, the ring's width row by row, the tail's thickness, where the fist and fingers
sit — so the vector can be checked against the artwork by overlaying the two. It is kept in the
artwork's own 115 by 121 coordinates inside a 120 box, and a single half-unit group centres the ink.
The ring became a filled path with its counter cut out by `evenodd`, because the artwork's ring is
thick on the sides and thin at top and bottom, and the tail became two strokes with the wrist turning
down into the fist, because one bar of one width did not look like the drawing. The launcher icon is
the one place that scales rather than copies: it fits the mark to 67 of the adaptive icon's 108 grid,
on the icon's own centre line.

## Verification

- `npx next build` clean in all three apps.
- The deployed stylesheet is grepped for each site's brand token and the served HTML for the new copy,
  so a palette that failed to deploy is caught rather than assumed.
- The centring was confirmed by eye, in bordered boxes at three sizes, and the app's copy was read back
  out of the built APK rather than trusted from the source, because the device installs the APK.
- Handoff note: `docs/ui-development/two-brand-design-system-ui-implementation.md`.
