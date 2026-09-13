# P1-05: Stale private key material in the working tree

**Priority:** P1 — an unused private key on disk is a liability and an ambiguity
**Status:** Resolved — the pair was confirmed unused and deleted
**Components:** `archive/keys/signer-key.pem`, `archive/keys/signer-cert.pem`

## The check that was made first

The archived certificate (`sha256 FAC18A22…`) is **not** the live certificate
(`sha256 8FBC1F3D…`), so it is a superseded key from an earlier layout. Nothing in the repository
referenced it: a search across every tracked source, config, script and document found only the two
files that report the finding itself. The live signing key is `key-management/keys/mdoc-signer.private.pem`
and remains gitignored, and every tracked file under `key-management/keys/` is public or metadata.

The archived pair was therefore deleted. If a very old demo credential one day fails to verify, this
is why — and `npm run db:reset` makes that a non-event.

## Problem

Two key files sit in an untracked `archive/` directory:

- `archive/keys/signer-key.pem` — a private key
- `archive/keys/signer-cert.pem` — the matching certificate

They are leftovers from an earlier key layout and are **not** the credentials in use: the live
signing key is `key-management/keys/mdoc-signer.private.pem`, which is correctly gitignored, and the
verification paths read the public material under `key-management/keys/`. Nothing tracked references
the archived pair.

## Why this is worth a story

- An old private key may still verify something. If it does, "which key signs my credentials" has
  two answers.
- `archive/` is untracked, so it does not appear in review, but it is one `git add -A` away from
  being committed.
- A reviewer asking "where are the keys?" should get one answer.

## Acceptance criteria

- A decision is recorded: delete the pair, or move it to the documented archive location with the
  private key removed (certificate only).
- If deleted, confirm first that no recorded or demo credential verifies against
  `archive/keys/signer-cert.pem`; if any does, that credential is regenerated rather than kept.
- `key-management/README.md` (or the key section of `docs/E2E_WALLET_ISSUANCE.md`) states where the
  live key lives, which file the services read, and that rotating it invalidates previously issued
  credentials.
- `git check-ignore -v` still reports the live private key as ignored.

## Notes

- Untracked files in a developer's working tree are not deleted unilaterally; the cleanup pass that
  raised this finding deliberately left them in place.
- No private material is tracked today: every tracked file under `key-management/keys/` is public or
  metadata only, and this story exists to keep it that way.
