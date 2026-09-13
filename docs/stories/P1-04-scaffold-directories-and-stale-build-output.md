# P1-04: Scaffold directories and stale build output in the tree

**Priority:** P1 — CI names a workspace that does not exist (see P1-02), and onboarding is confusing
**Status:** Resolved — the directories held nothing but dependency residue and are gone
**Components:** repository root, `verifier-frontend/dist/`

## What was actually there

Before deleting anything, each directory was inspected. All seven contained **only** `node_modules/`
and a stray `package-lock.json` — no source file of any kind:

| Directory | Reclaimed |
| --- | --- |
| `mobile-wallet-native` | 199.4 MB |
| `wallet-qr-receiver` | 2.0 MB |
| `signature-validator` | 0.5 MB |
| `verifier-qr-scanner` | 0.3 MB |
| `generator`, `schema`, `verifier-registry` | empty installs |

All seven were removed, along with the stale Vite-era `verifier-frontend/dist/`. `dist/` was already
ignored, so no ignore rule needed changing. The root `package.json` also listed `mobile-wallet` as a
workspace, but that directory is a Gradle project with no `package.json`; it has been removed from
the list. Every workspace name in the new CI workflow was checked against the repository.

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
