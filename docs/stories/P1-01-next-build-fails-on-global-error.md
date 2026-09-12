# P1-01: The academy app does not build

**Priority:** P1 — the app runs in development but cannot be built for release
**Status:** Open, reproduced on unmodified code in two apps
**Components:** `issuer-frontend` and `quals-portal` (Next.js 16.3.3, Turbopack)

## Problem

`npx next build` fails while prerendering Next's internal error boundary, in `issuer-frontend` and
identically in `quals-portal`. Both report `Compiled successfully` first, so application code is
fine and the failure is in the export step:

```
Error occurred prerendering page "/_global-error"
TypeError: Cannot read properties of null (reading 'useContext')
    at ignore-listed frames { digest: '973326699' }
Export encountered an error on /_global-error/page: /_global-error, exiting the build.
```

The build also prints repeated `Each child in a list should have a unique "key" prop` warnings
naming Next's own boundaries (`<__next_viewport_boundary__>`, `<html>`, `<meta>`, `<head>`), which
points at the framework rather than at application code.

## Evidence that it is not this repository's application code

- Reproduced with the P0-16 working tree stashed, so the failure exists on the committed revision.
- No page named `_global-error` exists in `app/`; it is Next's built-in global error boundary.
- The development server runs and serves every page normally, and `tsc --noEmit` is clean.

## What was already ruled out

- A stale `.next` cache: clearing it fixes three phantom type errors (a generated validator
  referencing pages that no longer exist: `app/history`, `app/invite`, `app/issue`) but does not
  change this failure.

## Suspected cause, to confirm before fixing

A version mismatch around React and Next, since `useContext` resolving to null during prerender is
the usual signature of two React copies or a client/server boundary imported the wrong way. Check
`next`, `react`, `react-dom` and `@types/react` versions across the npm workspaces, then whether a
single hoisted React is resolved by every workspace.

## Acceptance criteria

1. `npx next build` completes in `issuer-frontend` with no prerender error.
2. The release build serves the academy flow unchanged: `/get-credentials`, `/claim`, `/credentials`.
3. The cause is recorded, with the versions responsible, so the next dependency bump does not
   reintroduce it.
4. CI builds the app, so a broken release build is caught rather than discovered by hand.

## Non-goals

- No dependency major-version upgrade beyond what the fix requires.
- No change to the academy flow's behaviour.
