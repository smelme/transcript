# Two brands, one design system

**Story:** P0-48 · **Date:** 2026-10-03

Two products are served by one stylesheet: **Quals**, where a credential is opened, collected and
managed, and **Smart Academy**, the institution's own site. They looked the same, because they were
the same file: the same warm cream, the same yellow, the same pill-shaped buttons. A student who
started at the academy and finished at Quals had no way to tell where one ended and the other began,
which is the opposite of what a credential service is for.

The two are now recognisably different products built from one system. Quals is black, yellow and
white; Smart Academy is purple and white. Everything else — spacing, type scale, components, the
breakpoints — is still shared, so a fix in one place is still a fix in both.

## Where the brand lives

One token block per app, and nothing else carries a colour:

| App | Tokens | Brand |
| --- | --- | --- |
| `quals-frontend`, `quals-portal` | `app/globals.css` → `:root` | `--brand: #ffc400` on white and black |
| `issuer-frontend` | `app/globals.css` → `:root` | `--brand: #6d28d9` on white |

Both support a dark theme; the academy's inverts the brand to `#a78bfa` and its `--on-brand` to dark
ink, so a button stays readable rather than yellow-on-yellow.

**Yellow is a mark, purple is a colour.** `#ffc400` on white fails contrast as text at every size, so
on Quals it is confined to fills, rules and the marker under a link — links are ink with a yellow
underline. `#6d28d9` is dark enough to be read, so the academy can use it for links and headings.
That is the whole reason the two palettes are not mirror images of each other.

## What changed in the system

- **Tokens added:** `--brand-soft`, `--brand-ring`, `--on-ink`, `--link-rule`, `--ok-soft`, `--ok-ink`,
  `--err-soft`, `--err-ink`, `--hero-from`, `--hero-to`, `--hero-glow`.
- **Hard-coded colours removed** where they fought the brand: the hero gradient (which ended in an
  olive that belonged to no brand), the yellow glow on a chosen credential card, the yellow statistic
  figure that could not be read, the portal's logo mark that faded into green, and its indigo login
  wash.
- **Status colours stay universal** and are no longer brand-tinted: green means confirmed and red
  means refused on both sites, whichever institution is asking.
- **Neutral greys replace the cream.** A cream page reads as a brochure; this is a service that keeps
  records.
- **Buttons are rounded rectangles, not pills.** A pill is a consumer shape.
- **Focus rings** are ink on light surfaces and brand-coloured inside the dark sidebar, so the ring is
  visible wherever the keyboard is.
- **Links are underlined** in prose and opt out where they are already shaped like a control (`.btn`,
  `.nav-cta`, the navigation, a credential card).

## Copy

Rewritten for the person reading it, on the surfaces they read: both landing pages, the requesting
wizard, the collecting screen.

- **The Quals front door** was a card explaining that "a shared document is opened here". It is now a
  branded page that answers the three states somebody can arrive in: you were sent a link, the link
  has expired, or you hold the credential.
- **The academy's landing** lost "cryptographically signed", "tamper-evident" and "selective
  sharing" — the same promises, in words a graduate would use.
- **The wizard** lost about a third of its words. "You will be asked for a photo identity document and
  a selfie. This is how the school can be sure the record it finds belongs to you, since we cannot
  check an address on its own for a record this old" is now "You will need a photo ID and a selfie. It
  is how the school knows the record it finds is yours."
- **"Verifiable credentials"** as a strapline is now **"Digital credentials"**: the first is the
  industry's word for it, the second is the reader's.
- **"Checking with the identity provider…"** is now **"Checking your document…"** — the reader has
  never met the provider.

## The mark

One mark, drawn once and copied nowhere but the app: **a white Q whose tail is a hand, in gold**,
redrawn on 3 October 2026 from the logo supplied by the product owner. It replaces a Q with a plain
tail, which had itself replaced a green shield — both of them marks the app did not have.

| Where | What |
| --- | --- |
| `quals-frontend/public/quals-mark.svg` | the site's mark, transparent |
| `quals-frontend/app/icon.svg` | the tab icon: the same mark on a black tile |
| `quals-portal/app/components/quals-mark.tsx` | the portal's mark, inline — that deployment serves no static files |
| `mobile-wallet/.../res/drawable/ic_quals_logo.xml` | the app's mark, the same geometry as a vector drawable |
| `mobile-wallet/.../res/drawable/ic_launcher_foreground.xml` | the launcher icon's foreground, on the app's black |

The web mark is transparent rather than tiled because the field belongs to the surface, and every Quals
surface is black. The launcher icon supplies its own black, as an adaptive icon must. The app's raster
logo and its five per-density launcher rasters are gone: minSdk is 26, so the vector foreground is what
every device in support uses, and a raster cannot be redrawn by reading the repository.

**The artwork leans in the grid it was drawn on** — its ink sits about 4.8 units right and 1.8 down of
the 64×64 box centre — and every surface centres the box, not the ink, so the mark read as shifted on
the phone while the layout was already correct. The correction belongs in the drawing rather than in a
layout, because a per-surface nudge has to be repeated on every new surface and is wrong the moment
the layout changes. All five copies therefore wrap the paths in a group that centres the ink:
`translate(-3.51 -0.61) scale(0.9642)` as an SVG group, the equivalent `<group>` in the two drawables,
and the launcher's foreground nests that wrap inside the group which scales the mark into the adaptive
icon's safe zone. Its outer scale was retuned (1.19 → 1.207) so the home screen shows the same sized
mark as before; the ink lands on the icon's centre line at 54 of 108.

**Two golds, deliberately.** The logo's gold is `#c9a227` — the brass in the supplied artwork. The
interaction gold (`--brand`) is `#ffc400`, which comes from the app's own theme and is what buttons,
focus rings and links use. If they should be one colour, the logo's is the one to move, not the app's.

## Where the colours come from

The app is black with gold and white, so Quals is too. This is not a dark *option*: the layout sets
`data-theme="dark"`, and that block is the brand.

| Token | Quals | Smart Academy |
| --- | --- | --- |
| `--bg` | `#000000` (the app's `quals_pure_black` window) | `#ffffff` |
| `--surface` | `#0b0f0c` (the app's ink, lifted off the black) | `#ffffff` |
| `--brand` | `#ffc400` (the app's `QualsGold`) | `#6d28d9` |
| `--text` | `#ffffff` | `#1c1533` |
| `--ok` | `#7ee2a8` — status only | `#146c2e` — status only |

**Colours that are deliberately absent.** `QualsGreen`, `QualsGreenDark` and `QualsGreenLight` exist in
`Theme.kt` as Material `secondary`/`tertiary` slots and never reach a brand surface, so they are not
part of the site either. If the app starts using them, this table is where the site follows.

## Accessibility

- Body text is `#101012` on `#ffffff` (17.9:1). Quals' brand yellow is never text.
- Academy brand `#6d28d9` on white is 7.0:1, and white on it is 7.0:1, so both directions are safe.
- The dark sidebar's muted text was `#64748b` on `#0f172a` (3.3:1, below AA for small text); it is now
  `#8e8e96` on `#0a0a0a` (4.6:1).
- Focus is never carried by colour alone: every focusable element has a 3px ring with an offset, and
  the skip link is still the first thing in the tab order.

## Responsive and state behaviour

Unchanged: the shared breakpoints (1024 / 900 / 720 / 560 / 400), the sticky bar that wraps rather than
overflowing, the `.table-scroll` box, and the QR wrapper that keeps a code square at any width. The
Quals landing gained a three-card grid that was already responsive through `auto-fit`, so it stacks on
a phone without new rules.

Every state was checked in the built output: loading, empty, error, success, and both themes.

## Verification

- `npx next build` clean in `quals-frontend`, `issuer-frontend` and `quals-portal`.
- The deployed stylesheet is grepped for the brand token of each site, and the served HTML for the new
  copy, so a palette that silently failed to deploy is caught rather than assumed.
- The centring was judged by rendering the served mark in bordered 200, 120 and 64 pixel boxes and
  looking at the margins, because "centred" is not something a build can assert; the app's copy was
  then read back out of the built APK with `aapt2 dump xmltree`, which is what the device installs.
- Story P0-48 records what changed and why.
