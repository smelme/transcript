# Mobile and tablet layout, UI implementation

**Story:** P1-12. **Date:** 2026-09-20. **Applies to:** `issuer-frontend`, `quals-frontend`,
`quals-portal`, `verifier-frontend`, `trust-university-frontend`.

## The contract

Three things have to hold at every width, because each of them is a failure a person feels:

| Failure | What it looks like | How it is prevented |
| --- | --- | --- |
| The page scrolls sideways | content sits off the right edge and the header drifts when you swipe | no fixed-width row holds the header; wide content scrolls inside its own box |
| An element is wider than the screen | a table or a QR code pushes the layout out | tables get a scrolling container; images are capped at 100% |
| A control is too small to tap | a menu item or a button is a 30px sliver | controls are at least 44px on a touch screen |

## Breakpoints

One set, used by all five sites, so a page does not change shape depending on which site it is on.

| Width | Meaning | What changes |
| --- | --- | --- |
| `1024px` | tablet | the portal's content box stops being wider than the screen |
| `900px` | tablet portrait | the portal's sidebar becomes a bar across the top |
| `720px` | phone | the header keeps its brand and control on the first row and moves the menu to its own scrolling row; multi-column grids and definition lists collapse |
| `560px` | phone | single column, reduced padding, footer stacks |
| `400px` | small phone | the last spacing reductions |

Type and spacing that can scale linearly use `clamp()` in the base rule rather than a breakpoint.
That covers every width between the steps above, instead of snapping at four sizes.

## Per site

### Academy and Quals share site

These two share one stylesheet, byte for byte, so a change lands on both or neither.

- **Header.** Was one 66px line holding a brand, two links and a round button, which cannot fit a
  phone. It now wraps, and the menu takes its own row that scrolls sideways.
- **Hero and sections.** Padding and the headline size scale with the viewport.
- **Forms.** The two-column field grid collapses to one column when a field would be narrower than
  220px, which is a phone.
- **QR code.** Was a fixed 240px box, wider than a small phone once the card padding was added. It
  is now `min(240px, 100%)` and stays square.

### Management portal

- **Sidebar.** Was a 248px column on every screen, so on a phone it took most of the width; the
  small-screen rule then stacked it *above* the content, putting a screenful of menu in front of
  every page. It is now a bar across the top with the menu scrolling sideways, so the content
  starts immediately underneath it.
- **Topbar, card headers, modals.** Wrap rather than squeezing two items onto one line.
- **Tables.** The boxes already scrolled; the tables inside now have a minimum width so columns stay
  readable instead of collapsing into slivers.

### My Jobs

- **Result rows.** Label and value were pushed to opposite ends of the line; on a phone they stack.
- **Issuer cards, filter bar.** Wrap, and their actions become full-width buttons.
- **Camera placeholder and result card.** Reduced padding and type, so the useful part is above the
  fold.

### Trust University

- **Transcript table.** Seven columns cannot fit a phone, so it scrolls inside its own box.
- **Header inset.** The header sat inside a container that already had padding and added its own, so
  the brand was inset twice as far as the page content. It now lines up with the content, at every
  width.

## Responsive behaviour notes

- Nothing is hidden to make a page fit. Every word that was on a page is still on it.
- Nothing scrolls sideways except a table inside its own box, which is the intended overflow.
- The one deliberate appearance change on desktop is Trust University's header alignment, which was
  misaligned at every width.

## How it is checked

`scripts/check-responsive.mjs` opens each site at 360x740, 390x844, 768x1024 and 1024x768 in a real
browser and reports, per page and per width: whether the body scrolls sideways, which elements are
wider than the screen without being in a scrolling box, and which controls are under 44px.

It also puts a seven column table into the Quals and Trust University pages, because their real
tables only appear once a credential has been presented, and it refuses to report success if it has
nothing to check. With `SELFTEST` set it inserts an uncontained 3000px element and fails unless that
is reported, so a green result means the checks can fail.

The portal's signed-in pages are included when `PORTAL_EMAIL` and `PORTAL_PASSWORD` are set, so the
admin surface is measured rather than assumed. The credentials are read from the environment and are
not written down anywhere in the repository.

Playwright is deliberately **not** a dependency of the sites. Every service builds with
`npm ci --include=dev` at the workspace root, so a devDependency there makes every deploy download a
browser no deployed service will ever use. Install it once, locally, before running the check:

```
npm install --no-save --no-package-lock playwright@1.59.1
```

The check says this itself if Playwright is missing.

```
$env:SITES = '{"academy":"http://127.0.0.1:3002","quals":"http://127.0.0.1:3005","portal":"http://127.0.0.1:3004","myJobs":"http://127.0.0.1:3003","trustUniversity":"http://127.0.0.1:3007"}'
node scripts/check-responsive.mjs
```

## What the first green result was hiding

The public-page run was 48 checks and all green, and that was worth very little: those were the pages
that were already fine. Covering the portal's six admin pages as well took it to 72 checks and found
three faults, all at 1024px, the width where a 248px sidebar and a wide table have least room.

| Page | Fault |
| --- | --- |
| Credentials | page scrolled sideways by 228px |
| Sharing | page scrolled sideways by 244px |
| Wallet accounts | page scrolled sideways by 146px |

No single element was wider than the screen, which is what made it worth measuring rather than
guessing: the content column was `1fr` in the shell grid, and `1fr` keeps an automatic minimum, so
the wider the table got the wider the whole column got. `minmax(0, 1fr)` lets the column shrink, and
the table then scrolls inside its box, which is what the box was for. Treating a green result as
proof of quality is the mistake this section records.
