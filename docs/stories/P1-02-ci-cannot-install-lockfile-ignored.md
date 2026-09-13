# P1-02: CI cannot install anything, because the lockfile is gitignored

**Priority:** P1 — every build and test step fails before it reaches any code
**Status:** Resolved — lockfiles committed, two workflows replaced by one that runs
**Components:** `.gitignore`, `.github/workflows/ci-cd.yml`

## Problem

`ci-cd.yml` installs each workspace with `npm ci`:

```
- name: Install Issuer Service dependencies
  run: cd issuer-service && npm ci
```

`npm ci` refuses to run without a lockfile — it exists to install *exactly* what a lockfile
records. But `.gitignore` lists `package-lock.json`:

```
package-lock.json
yarn.lock
pnpm-lock.yaml
```

and `git ls-files package-lock.json` returns nothing, so the file is not in the repository. A CI
checkout therefore has no lockfile, and every install step fails before a single test runs.

## Second problem — a workflow names a workspace that does not exist

`cd.yml` builds `mobile-wallet-native`. That directory is not in the repository: it exists locally
with nothing tracked inside it, apart from a stray `package-lock.json` (tracked as P1-04). So even
after the lockfile question is settled, a fresh checkout cannot complete the matrix as written.

Closing this story means checking every workspace name in `ci-cd.yml` and `cd.yml` against the
repository, and settling what each one builds:

```
git ls-files mobile-wallet-native    # empty
```

Either the workflow is corrected to name the real wallet workspace, or the directory is given a
tracked purpose.

## Fixed

`.gitignore` no longer ignores lockfiles (with a comment saying why, so nobody restores the
convenience), and the root lockfile, `devops/package-lock.json` and
`e2e-integration-tests/package-lock.json` are committed. `npm ci --dry-run` succeeds from the root
and in both standalone projects.

Both workflows were then replaced by a single `.github/workflows/ci.yml`, because between them they
could not run at all. What was actually wrong:

- **`ci.yml` was not valid YAML.** A line in the scenario block scalar was indented two spaces short,
  closing the block early, and `ci-cd.yml` had two `run:` keys in one step. Nothing in either file
  could ever have executed.
- **Three workspaces were installed separately with `npm ci`** inside an npm-workspaces monorepo, and
  one of them, `mobile-wallet-native`, does not exist. `npm ci` also refuses to run without a
  lockfile, which was gitignored — hence this story.
- **`devops` and `e2e-integration-tests` had steps but no committed lockfile either**, so their
  installs failed on the same grounds.
- **The branch filters were wrong**: both triggered on `main`/`develop`, while this repository's
  default branch is `master`, so a pull request ran no checks.
- **`cd.yml` was referenced by this story but never existed.** The only other workflow was `ci-cd.yml`.

To make the pipeline mean something, three things had to be fixed first, each of which had been
failing silently:

- **`lint` failed everywhere.** `linebreak-style: unix` reported thousands of errors on Windows
  because `core.autocrlf=true` rewrites the working tree to CRLF while the repository stores LF. A
  `.gitattributes` with `text=auto eol=lf` now states the convention, and the rule is off. The real
  remainder — dead code, unused imports, `==`, a function declared inside a block, Express error
  handlers whose unused fourth parameter was reported as unused — is fixed, so `npm run lint`
  passes in all seven workspaces rather than being ignored.
- **`next lint` no longer exists in Next 16**, so the three apps that used it were failing with
  "Invalid project directory provided, no such directory: …/lint". ESLint here has no TypeScript
  parser, so the two TypeScript apps lint with `tsc --noEmit` — a real check, not a placeholder —
  and the JSX apps lint with `eslint app`.
- **The production build was broken** (P1-01). It is now part of the pipeline.

`START_LOCAL_SERVICES.ps1` is also replaced: it printed a fabricated "150/150 tests, 100% SUCCESS"
summary without running any test, named ports 5173/5174 that no longer exist, and referenced the
deleted `mobile-wallet-native`. It now starts the six real services, reports which came up, and
prints the URLs.

Verified by running precisely what the workflow runs, in order: `npm ci`, lint in all seven
workspaces, unit tests (10 + 76 + 61), and `next build` for all four web apps.

## Evidence

- `.gitignore` contains `package-lock.json`; `git ls-files package-lock.json` is empty.
- `ci-cd.yml` uses `npm ci` in the installer steps for the issuer service, verifier service,
  verifier frontend, mobile wallet, e2e tests and devops.
- The file does exist on a developer machine (which is why nobody notices): it is ignored, not
  absent.

## Why it is not obvious locally

Locally `npm ci` succeeds because the untracked lockfile is sitting there. Only a fresh clone — which
is what CI is — exposes it. The same applies to anyone onboarding, or to any runner that clears its
workspace.

## Options

1. **Commit the lockfile** (recommended): reproducible installs, and `npm ci` starts working
   everywhere. Cost: a large file in every diff that touches dependencies, and conflicts to resolve
   on merge.
2. **Switch CI to `npm install`**: no lockfile needed, but installs become non-deterministic, which
   for a repository whose tests assert exact mdoc bytes is a real risk.
3. **Keep the lockfile ignored and pin only the direct dependencies** in each `package.json`: the
   least reproducible of the three, and it does not fix `npm ci`.

## Acceptance criteria

1. CI installs and runs every suite on a fresh checkout, with the chosen approach recorded.
2. If the lockfile is committed, it is regenerated on a clean clone and reviewed before the first
   commit of it.
3. The chosen approach is stated in the README so a contributor knows whether to commit a lockfile.
4. Whatever is decided, a broken install is caught by CI rather than by hand.

## Non-goals

- No dependency upgrades beyond what the fix needs.
- No change to the test suites themselves.
