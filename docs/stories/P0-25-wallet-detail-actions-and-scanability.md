# P0-25. Wallet detail: the actions, and a readable document

## Why

Three complaints about the credential detail screen, all correct:

1. **The bottom was a stack of three full-width buttons**, Share, Activity, Delete, with the
   destructive one shoulder-to-shoulder with the primary one, and all of them at the end of a long
   scroll.
2. **The document was well categorised but a long scroll.** One block per claim meant a credential
   with a dozen courses was a dozen-plus rows to get past.
3. **The Activity button was always there**, including when there was nothing to show.

## Decision

- **One primary action, always on screen.** "Share credential" moved into a bottom bar, so it no
  longer has to be found at the end of the scroll and nothing competes with it.
- **Destructive actions move out of the way.** "Delete credential" is now behind a *More* overflow
  in the title bar: rare, deliberate, and no longer adjacent to the button a holder came to press.
- **Activity is a row, not a button, and only when there is something to show.** It states how many
  disclosures there are and opens the log. No activity, no row. An entry point leading to "nothing
  here" is worse than no entry point.
- **Every block collapses to a headline.** Each says in one line what it is about. A name, the
  issue date, the award. And opens when tapped. Courses, the one block that can run long, open
  three rows at a time with "Show all N".
- **The redundant Wallet block is gone.** The header card already shows the credential id, so
  repeating it was a block of scroll for nothing.

## What changed

| Layer | Change |
|---|---|
| `data/ClaimCatalogue.kt` | `ClaimGroup` gains a stable `id`; public `SECTION_*` ids; `headlineFor(group)` gives the one-line summary |
| `ui/Screens.kt` | `ClaimSection` (collapsible, courses capped), `ActivityRow`, bottom bar with the primary action, overflow menu for delete, delete errors reported at the top where the menu is |
| tests | Three new: the headline rule, the course block leaving its headline to its title, and a block the wallet has no opinion about still having one |

## Verification

- Wallet unit tests: **50 pass, 0 fail**.
- The new tests caught a real defect before it shipped: the headline joined *every* matching claim,
  so the Credential block read "2026-09-18 Smart Academy". The rule is now "the first thing the
  credential can say about this block", with a name the one case worth saying twice.
- APK built and installed; app launched on the phone with the tunnels up.

## Remaining

- Device read-through of the new screen at real lengths (a combined credential with twelve courses)
 . The case the collapse is for.
