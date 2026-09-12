# P1-04: Scaffold directories and stale build output in the tree

**Priority:** P1 — CI names a workspace that does not exist (see P1-02), and onboarding is confusing
**Status:** Open, reproduced during UAT (see `docs/analysis-discovery/uat-transcript-flow.md`, UAT-012)
**Components:** repository root, `verifier-frontend/dist/`

## Problem

Seven directories exist with no tracked content:

| Directory | Contents |
| --- | --- |
| `generator` | empty |
| `schema` | empty |
| `verifier-registry` | empty |
| `signature-validator` | a stray untracked `package-lock.json` |
| `verifier-qr-scanner` | a stray untracked `package-lock.json` |
| `wallet-qr-receiver` | a stray untracked `package-lock.json` |
| `mobile-wallet-native` | a stray untracked `package-lock.json` |

`mobile-wallet-native` matters more than the others: the CI workflow in `.github/workflows/cd.yml`
still names it as a workspace to build, so a fresh checkout fails the way P1-02 describes.

`verifier-frontend/dist/` additionally holds a stale bundle from the earlier Vite implementation,
which contains code paths that no longer exist (found while auditing copy: the bundle still mentions
the old verification app name).

## Expected behaviour

The tree lists only the components that exist, and every directory a workflow names is a real
workspace.

## Acceptance criteria

- Either the directories are removed, or each is given a tracked purpose (a `package.json` with a
  name and a one-line README saying what it is for).
- The stray untracked `package-lock.json` files are gone.
- `verifier-frontend/dist/` is removed, and `dist/` is ignored for that workspace so a future build
  cannot leave it behind again.
- Every workspace named in `.github/workflows/cd.yml` and `ci-cd.yml` exists in the repository; the
  check should be part of closing this story, not a separate pass.
- `README.md` lists only real components.

## Notes

- Removing directories that hold nothing tracked is safe with `git`; the working copies may hold
  local files, so check before deleting rather than assuming.
- This story and P1-02 share the CI workflow file; whichever is done second should re-read it.
