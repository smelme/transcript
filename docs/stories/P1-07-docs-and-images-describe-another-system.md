# P1-07: The documentation and container images describe a system that was never built

**Priority:** P1 — a new contributor, or an institutional reviewer, reads the wrong system first
**Status:** Open, partially addressed (README, launcher script and the stale compose file are done)
**Components:** `DEVELOPMENT.md`, `LOCAL_DEPLOYMENT.md`, `SETUP.md`, `QUICKSTART.md`,
`CONTRIBUTING.md`, `devops/Dockerfile.*`, `devops/docker-compose.yml`

## Problem

Several documents describe the initial design rather than the system in this repository:

- **PostgreSQL** as the database, with `DATABASE_URL`, a schema per service and two database
  containers. The system stores everything in one SQLite file through `better-sqlite3`.
- **Keycloak** as the identity provider, with `KEYCLOAK_URL`, `KEYCLOAK_REALM` and
  `KEYCLOAK_CLIENT_ID`, and compose recipes that start a Keycloak container. There is no Keycloak:
  the wallet receives a credential and presents it, and administrators sign in to the portal with a
  password and a session cookie.
- **Ports 5173/5174** and a Vite-based frontend. The apps are Next.js on 3002, 3003, 3004 and 3007.
- **A root `docker-compose.yml`** that started `postgres`, `keycloak` and `redis`. Nothing in the
  system reads Redis or PostgreSQL, and no test or script referred to that file.
- **`CONTRIBUTING.md`** asks for PostgreSQL SQL conventions.
- **The container images cannot build.** `devops/Dockerfile.*` copies `package.json` and
  `package-lock.json` from a service directory as its context, which suits a repository where each
  service had its own lockfile. This is an npm-workspaces monorepo with one root lockfile, so the
  `COPY` fails and `npm ci` would fail next.

## Why it matters

This is the first thing an outside reader sees, and it is wrong in ways that waste their time: they
install PostgreSQL, start Keycloak, and look for a frontend on 5173. It also gives a reviewer no way
to tell which parts of the repository are real.

## Acceptance criteria

- `DEVELOPMENT.md`, `LOCAL_DEPLOYMENT.md`, `SETUP.md`, `QUICKSTART.md` and `CONTRIBUTING.md` either
  describe the real system or are removed. Whichever survives agrees with `README.md` about the
  stack, the ports, the database, the environment variables and how to run the demo.
- There is one setup path, not four: install, reset, seed, start, and the URLs.
- The container images build from the repository root with the workspace layout, or they are removed
  from the repository with the decision recorded. `devops/docker-compose.yml` is the maintained stack
  and already describes the real services (`issuer-service`, `verifier-service`,
  `verifier-frontend`, two SQLite volumes, `nginx`).
- `CONTRIBUTING.md` asks for SQLite-compatible SQL.
- Anything aspirational is marked as such, the way `README.md` now marks the unbuilt pieces.

## Already done in this pass

- `README.md` rewritten to describe the system that exists, with an explicit "Not built yet" section.
- The stale root `docker-compose.yml` (PostgreSQL, Keycloak, Redis) deleted;
  `devops/docker-compose.yml` remains as the container stack.
- `START_LOCAL_SERVICES.ps1` replaced with one that starts the real services and reports honestly.

## Notes

- Leave `docs/` alone: the analysis, architecture and story files are accurate and current.
- The wallet has its own README under `mobile-wallet/`; check it against the Gradle tasks that exist.
- `package.json` still declares `"engines": { "node": ">=18.17.0" }`. Next 16 needs Node 20, and CI
  runs 20, so the declared floor is lower than reality — worth correcting here.
