# P0-46: The check and the payment happen here

**Status:** ✅ Done — 2026-09-27
**Components:** `quals-frontend` (the wizard), `issuer-service` (the identity return, the checkout)
**Depends on:** P0-36 (asking), P0-37 (the fee)
**Blocks:** nothing

## Why

Two steps took the applicant off the page, and both of them took them away at the point where they
are least sure of what is happening:

- The document check opened in a **second tab**, and the page left behind said "your check is open in
  another tab" — which asks a person holding a phone to keep track of two things, and leaves the tab
  they started in as the one they have to remember to come back to.
- The fee **sent them to Stripe** and brought them back. It worked, and it is a page fewer to be lost
  on: the applicant is about to hand over a card, and a form that appears where they already are reads
  as part of the request rather than as somewhere else that has to be trusted.

## The check, in the same tab

`startIdentity` navigates instead of opening a window, and the provider brings the browser **back into
the form**: the return route settles the case, then redirects to
`/request?reference=…&token=…&identity=verified|failed|pending`, which the wizard reads on load. A
verified check carries on to the review step; a failed one shows the reason and offers another
attempt; anything still pending waits on the poll it already had.

Three things did not change, deliberately: the decision is still **fetched from the provider** rather
than believed from the query string; a return we cannot place still answers with a page rather than
stranding the browser; and the handle travels in the redirect, because it is the only thing that lets
somebody back into their own case.

The wizard also lost a button that was quietly wrong: "I have finished the check" moved to the review
step without asking anybody whether the check had finished. It is now **Check again**, which asks.

## The fee, embedded

`PaymentService.createEmbeddedCheckout` creates the same session with `ui_mode=embedded` and
`redirect_on_completion=if_required`, and returns the client secret the browser mounts;
`POST /requests/:id/checkout` answers with that secret and the publishable key. The wizard loads
Stripe.js only when somebody is actually paying, mounts the form into the page, and confirms the
payment from the **issuer's own record of the session** — recorded when the session was created — so
nothing depends on a return URL keeping its query string.

The hosted checkout and its `createCheckout` method are left in place: the embedded form is what the
page uses, and a redirect is still the right answer for a caller that cannot mount anything.

## Verified

- The provider account really does support this: an embedded session created against Stripe in test
  mode returned `ui_mode: embedded`, `status: open` and a client secret.
- `tests/identity-return.test.js` (new, 3 tests): the redirect carries the case back to the form, a
  query string claiming `status=Approved` never becomes a decision, and a return with no case still
  answers with a page.
- The issuer suite is 166/166, and both apps typecheck and build.

**Not verified:** the money moving and the credential arriving afterwards. That needs a card in a
browser, which is the next thing to do by hand — the pieces either side of it are tested.
