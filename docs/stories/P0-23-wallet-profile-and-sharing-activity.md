# P0-23 — Wallet account panel and sharing activity

## Why

Two gaps on the holder's side of the wallet, both about the holder being able to see their own
situation:

1. **No account summary.** The only sign of who was signed in was the credentials themselves, and
   signing out lived in the title bar, one tap from the scanner.
2. **No record of sharing.** A holder could disclose claims to a registrar or a website and then
   had no way to find out afterwards what had been sent, to whom, or when. Every other wallet that
   matters (Apple Wallet, Google Wallet) keeps this record, and without it a holder cannot audit
   their own disclosures.

## Decision

- **The record belongs to the wallet, not the relying party.** It is written by the wallet when a
  disclosure actually happens, kept in encrypted storage beside the credential it came from, and
  deleted with that credential. Nothing is recorded on a share that fails.
- **Record the fields, show the values.** The log stores which element identifiers were disclosed
  per namespace — the request the holder actually answered. The values shown against them are read
  from the credential itself, so the holder sees what the document says rather than a copy the
  wallet made.
- **Both disclosure paths are recorded**, because both are disclosures: the email share flow
  (`WalletRepository.submitShare`) and DCAPI presentment to a website
  (`PresentationActivity` → verified origin).
- **Two features, one entry point each.** The account panel is on the wallet list; activity is a
  button on the credential detail, opening a list newest-first with one entry expandable at a time.

## What was built

| Layer | Change |
|---|---|
| `data/ShareActivity.kt` | `ShareActivity` model, JSON codec (pure Kotlin, no Android), `ShareActivityLog` bounding the log at 50 per credential, newest first |
| `data/SecureStore.kt` | `activity(id)` / `recordActivity(activity)` under `activity_<credentialId>`; removed with the credential |
| `data/WalletRepository.kt` | `signedInEmail()`, `activity(id)`, `activityCount(id)`; `submitShare` records the disclosure it just made |
| `presentation/PresentationActivity.kt` | Records a presentment against the verified origin, from the parsed request |
| `ui/Screens.kt` | `ProfilePanel` (name, email, credential count, sign out) on the list screen; `Activity` button on the detail screen; `ActivityScreen` with expandable entries |
| `MainActivity.kt` | `Screen.Activity(credentialId)` wired from the detail screen |
| `data/ClaimCatalogue.kt` | `sectionTitleFor(namespace)` so a disclosure is labelled the same way as the document |

Sign-out moved from the title bar into the account panel, where the account it ends is stated.

## Verification

- `:app:testDebugUnitTest` — 47 tests, 0 failures. Six new: round trip, presentment with no
  recipient name, one damaged record dropped without losing the log, empty/absent/not-JSON input,
  an undated record read as undated rather than 1970, and the newest-first bounded log.
- Compile-checked wiring for both disclosure paths; APK built and installed.
- Not yet exercised: a real share and a real presentment on a device, which is the next thing to do
  by hand (UAT).

## Remaining

- Device UAT of both screens: sign in, share to an email, present to the Chrome test page, then read
  the activity list back.
- The activity list shows disclosures of the credential it is opened from. A wallet-wide view
  ("everything I have ever shared") was not asked for and is not built.
