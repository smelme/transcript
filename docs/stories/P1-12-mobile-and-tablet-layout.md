# P1-12: Every site is usable on a phone and a tablet

**Status:** In progress
**Components:** `issuer-frontend`, `quals-frontend`, `quals-portal`, `verifier-frontend`,
`trust-university-frontend`

## The problem

The five sites were built and checked on a desktop browser. On a phone the navigation and the
layout come apart: the academy's header holds a brand, two links and a round button on one 66px
line, the management portal puts a 248px sidebar above everything, and tables with five or six
columns are wider than the screen.

Nobody reported any of this as a bug, because nothing was being checked at a phone width. That is
the deeper fault: there is one breakpoint per site and no verification at any width.

## What "usable" means here

| Requirement | How it is met |
| --- | --- |
| Nothing overflows sideways | no horizontal scrolling of the page body at 360px |
| The menu is reachable | navigation wraps or becomes its own scrolling row; the portal's sidebar becomes a bar |
| Text stays readable | type scales with a fluid range instead of one fixed desktop size |
| Multi-column content stacks | form grids, definition lists, scanner panes and stat grids collapse in order |
| Tables stay readable | wide tables scroll inside their own box, not the page |
| Controls are tappable | interactive controls are at least 44px tall on touch screens |
| Spacing suits the screen | section and card padding reduce on phones |

## The breakpoints

One set, used by all five sites, so a page does not change shape depending on which site it is on.

| Width | What changes |
| --- | --- |
| `1024px` | tablet: sidebars and wide grids tighten |
| `900px` | tablet portrait: the portal's sidebar becomes a top bar |
| `720px` | phone: navigation moves to its own row, multi-column grids collapse |
| `560px` | phone: single column everywhere, spacing and type reduce |
| `400px` | small phone: the last reductions, so a 360px screen has room |

## The work

1. **Academy and Quals share site** (`issuer-frontend`, `quals-frontend`). The two stylesheets are
   identical files, so they change together. The header becomes a wrapping bar with the navigation
   on its own row; the form grid, hero and section spacing scale; the QR code stops being a fixed
   240px; the courses tables scroll in their own box.
2. **Management portal** (`quals-portal`). The sidebar stops being a 248px column on small screens
   and becomes a compact bar with a horizontally scrolling menu, so the content is not pushed below
   a full screen of menu. Top bars, card headers and definition lists wrap.
3. **My Jobs** (`verifier-frontend`). Result rows and issuer cards stack instead of squeezing label
   and value onto one line.
4. **Trust University** (`trust-university-frontend`). The transcript table scrolls in its own box;
   header, card and footer spacing reduce.

## Acceptance criteria

- At 360x740, 390x844, 768x1024 and 1024x768 the page body does not scroll horizontally on any of
  the five sites, on every page a person can open.
- The navigation on each site is fully reachable and each item is tappable at 360px.
- Every table wider than its container scrolls inside the container.
- Interactive controls measure at least 44px in one dimension.
- No page changes its information or wording; this is layout only.

## Verification

- All five sites build and lint.
- A scripted check opens each site at the four widths above in a real browser and reports, per page,
  whether the body overflows horizontally, which elements are wider than the viewport, and whether
  any control is under 44px.

## Not in this story

- The design system's open wave-2 items (one type scale across sites, shared header and footer
  markup, the portal's indigo primary). The type work here is limited to making sizes fluid, not to
  replacing four sites' scales with one.
- The wallet app, which is a native Android surface.
