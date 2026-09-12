# P1-02: CI cannot install anything, because the lockfile is gitignored

**Priority:** P1 — every build and test step fails before it reaches any code
**Status:** Open, reproduced by inspection
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
