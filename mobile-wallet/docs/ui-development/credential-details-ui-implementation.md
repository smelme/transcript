# Credential details and deletion

## Flow

- Device authentication opens automatically when the wallet contains at least one credential; no in-app unlock screen or additional action is displayed.
- An empty wallet does not request device authentication. Once a credential is claimed, device authentication is required before claims are displayed.
- Returning after the app has been backgrounded automatically requires device authentication again.
- The credential detail screen displays only parsed certificate claims: name, institution, degree level, and graduation date.
- It does not render the credential ID or encoded mdoc/CBOR data.
- Selecting **Delete credential** opens a confirmation dialog.
- Confirming deletes the mdoc, its derived claim summary, and its ID from encrypted wallet storage, then returns to the credential list.
- If secure storage cannot be updated, the credential remains visible and an error is shown.

## Accessibility

- The deletion action uses a labelled button.
- The confirmation dialog provides explicit **Delete** and **Cancel** actions and cannot be dismissed while deletion is in progress.

## Validation

- Build: `:app:assembleDebug`.
- Manual: open a credential, confirm no encoded payload is present, delete it, return to the list, then reopen the app to verify the credential remains absent.
