# P0-26. Wallet cards that look like documents

## Why

Three observations, all about the same thing: nothing in the wallet looked like what it was.

1. **The activity entry was a card, and the credential was a card**, so it read as another document
   to open rather than as something about the document.
2. **The account panel was a permanent card** at the top of the list. A lot of furniture for who
   is signed in and a way out.
3. **The credentials themselves were flat coloured tiles.** A credential is a document, and the
   documents people carry, licences, permits, ID cards, look like documents: they have print on
   them.

## Decision

- **Only the credential looks like a credential.** Activity became a quiet strip: "Sharing
  activity · Shared 3 times from this credential", on a muted surface, with *View*. It is also in
  the title bar's overflow, which is where a holder would look for a thing they do *about* a
  credential rather than *with* it.
- **The account folds away.** It is a line, monogram, name, "Account", that opens to show the
  address it belongs to, what the wallet holds, and Sign out. Expansion is animated.
- **The card is drawn like a printed one.** A gradient in the institution's two tones rather than
  one flat colour; angled hairlines and a cropped ring as the security print; the institution's
  monogram inside a ring where a seal would be; the holder's initials as a watermark; the name in
  display type; and the micro-labelled row an identity document carries its dates and number in —
  `ISSUED` / `CREDENTIAL NO.`. With a colour band along the foot.
- **Motion, sparingly.** Cards settle into place in order when the wallet opens, a card scales under
  the finger instead of rippling, and blocks of the document expand rather than jumping.

## On logos

The wallet has **no licence to redistribute institutions' logos**, so it draws a monogram in a ring
and uses the colours a reader would recognise each institution by. That is a deliberate limit rather
than a shortcut: `InstitutionBrand` is the single place a real crest and official palette drop in
when permission exists.

## What changed

| Layer | Change |
|---|---|
| `ui/CardFace.kt` (new) | `InstitutionBrand` (two tones), `brandOf`, `InstitutionSeal`, `VerifiedPill`, `Modifier.licenceFace` (gradient, hairlines, watermark ring), `CredentialFace` (compact and full) |
| `ui/Screens.kt` | Both cards now use `CredentialFace`; `AccountPanel` replaces `ProfilePanel`; `ActivityRow` restyled and added to the overflow; `ClaimSection` expands with animation; staggered card entrance; the old brand helpers deleted |
| tests | Unchanged. 50 pass. This is presentation, and the parts worth testing (grouping, headlines, the log) already are |

## Verification

- Wallet unit tests: **50 pass, 0 fail**; APK built, installed and launched with the tunnels up.
- Not verified visually by me: the wallet requires biometric unlock, so the screens themselves need
  a human look. The list, the detail card and the expanding account line are the three to check.
