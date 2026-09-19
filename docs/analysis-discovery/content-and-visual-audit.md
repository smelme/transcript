# Content and visual audit. Sites and app

**Date:** 2026-09-19
**Scope:** `issuer-frontend` (academy), `verifier-frontend` (My Jobs), `quals-portal`, `trust-university-frontend`, and the Android wallet.
**Method:** every user-visible string in the four front-ends was extracted and read; app strings read from source. Findings are quoted with their file.

## Headline finding

The **copy is in better shape than expected**. It is mostly plain, specific and free of the usual
tells of generated text. No "unlock the power of", no stacked triples, no em-dash-heavy
enthusiasm. What is inconsistent is the **presentation**: four separate front-ends, four separate
stylesheets, four headers, and different or missing brand assets. That, not the words, is what makes
the estate look assembled rather than designed.

| Area | Stack | Files | Assets | Header/nav |
| --- | --- | --- | --- | --- |
| `issuer-frontend` (academy :3002) | Next.js + TSX | 7 | `public/logo.svg` | its own, with a theme toggle |
| `verifier-frontend` (My Jobs :3003) | React + JSX | 8 | `public/logo.svg` | its own |
| `quals-portal` (:3004) | Next.js + TSX, has `components/ui.tsx` | 12 | **none** | its own (`nav.tsx`, `shell.tsx`) |
| `trust-university-frontend` (:3007) | React + JSX | 4 | **none** | its own |
| Wallet | Compose |, | institution marks drawn in code |, |

Two sites ship a logo, two ship none. Only the academy has a light/dark control, while the wallet
now has Device/Light/Dark. The wallet's palette (green/gold, `QualsTheme`) has no counterpart on the
sites, so nothing ties the app to the sites it belongs to.

## Copy findings

Worth fixing, in order of how wrong they are:

1. **Demo-speak leaking into a product surface.** `issuer-frontend/app/layout.tsx:46` —
   *"Smart Academy. Example issuing authority for the Quals network."* A holder should not be told
   the issuer is an example.
2. **Awkward phrasing.** `trust-university-frontend/app/page.jsx:178` — *"What we matched this
   record against"*. "Checked" is the word a verifier would use.
3. **Wordier than it needs to be.** `issuer-frontend/app/credentials/page.tsx:43` — *"Smart Academy,
   with a digital signature that proves the record is genuine"* → the signature is the proof; say so
   once.
4. **A claim where a fact would do.** `issuer-frontend/app/page.tsx:9` — *"Your qualifications,
   verifiable anywhere."* It is the hero, so it is a judgement call, not an error. Flagged, not
   changed.
5. **Punchy to the point of ambiguity.** `issuer-frontend/app/page.tsx:68` — *"Three steps, once.
   After that your credentials stay with you."* Reads as intended once, but "Three steps, once" asks
   the reader to work. Flagged, not changed.

Already good, and left alone: the empty states in `quals-portal` ("No credentials have been shared
yet."), the offer instructions on the academy page, and the wallet's own strings.

## The wallet

Its copy was reviewed as part of P0-30 and P0-31 and is consistent: "Add credential", "Scan a QR
code", "Your credential from X is successfully added". One judgement worth recording — *successfully
added* is redundant in the strict sense ("added" is the success), but it is how a person says it,
and the screen is a person's confirmation. Kept.

## Proposed waves

1. **One identity, applied.** A shared set of design tokens (palette, type scale, spacing, radii)
   consumed by all four front-ends, with the wallet's palette as the origin so the app and the sites
   finally look related. Plus the missing assets: a mark for the portal and Trust University, and
   one header/nav component shape reused across the four.
2. **Copy pass.** The four findings above across every page, plus a read of each page end to end for
   anything not caught by a string sweep (table captions, button labels, error messages).
3. **Page-level polish.** One purpose per page, a single primary action, and consistent empty,
   loading and error states everywhere.

The open question for wave 1 is whether "consistent" means one shared identity across the estate, or
each area internally consistent and merely well-kept. The first is more work and looks deliberate;
the second is safer where the sites have different audiences.
