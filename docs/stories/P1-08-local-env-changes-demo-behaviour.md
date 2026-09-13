# P1-08: A local `.env` silently changes what the demo does

**Priority:** P1 — whether the demo can sign anyone in depends on which machine it runs on
**Status:** Open, reproduced (and understood) during the cleanup pass
**Components:** `issuer-service/.env` (gitignored), `issuer-service/src/email-service.js`,
`issuer-service/src/wallet-account-service.js`, `START_LOCAL_SERVICES.ps1`, CI

## What happens

The one-time code is only returned in an API response when the email send **fails**:

```js
// wallet-account-service.js
const sent = await this._sendOtpEmail(...);
return { otpSent: sent.success, otp: sent.success || !devOtpAllowed() ? undefined : otp };
```

`issuer-service/.env` is gitignored, and on a developer machine it normally holds a real
`BREVO_API_KEY`. `dotenv` loads it, so on that machine the send *succeeds*, `otpSent` is `true`, and
the code is never in the response. Every script and UI flow that expects to read the code then fails
at sign-in — with a message that says "email configured + no dev fallback", which is accurate but
gives no hint that the cause is a local file.

The same repository therefore behaves differently in three environments:

| Environment | `BREVO_API_KEY` | Code returned? |
| --- | --- | --- |
| CI (no `.env`) | empty | yes — the send fails, `otpSent:false` |
| Developer machine with `.env` | real | no — the code is emailed |
| Launcher with its placeholder exported | `dev-disabled` | yes — the send is attempted and rejected |

Cost in this pass: every scenario script in the suite failed, on a freshly reset database, which
looked like a regression from the cleanup rather than an environment difference.

## Acceptance criteria

- Starting the demo does not depend on the contents of a gitignored file.
  `START_LOCAL_SERVICES.ps1` sets `BREVO_API_KEY=dev-disabled` unless the caller has set one, and
  says so in its output.
- The issuer either states plainly that email is unavailable, so a caller knows to look for the code,
  or refuses the request. Reporting `otpSent: true` when nothing was delivered is what makes this
  confusing.
- `issuer-service/.env.example` documents every variable the service reads, marks the email ones as
  optional, and states that a real key changes local sign-in behaviour.
- CI keeps exercising the no-provider path, so the branch that returns the code stays covered.
- When a scenario script cannot find a code, it prints which environment it detected, not only the
  two conditions it checked.

## Notes

- Nothing here is a defect in the email code: `sendEmail` correctly reports failure when no key is
  configured. The trap is that "configured" means "a provider was called", not "a code was
  delivered".
- Prefer making the environment explicit over teaching every script to read `.env`.
- Related: the story suite also depends on this. See P1-03 for resetting demo state.
