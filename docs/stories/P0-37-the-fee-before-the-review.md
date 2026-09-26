# P0-37: The fee, before the review

**Status:** Built - the fee is taken through the provider's hosted checkout, confirmed against the
provider rather than the return page, and the payment screen states the fee, the period and the
refund rule before the button. Refunds are still by hand, which is what the wording promises.
**Components:** `issuer-service` (checkout, webhook, reconciliation), `quals-frontend` (payment
step and confirmation)
**Depends on:** P0-36
**Blocks:** P0-38 (there is nothing to review until the request is paid and frozen)

## The change

Quals has a payment stub: `issuer.createCheckout()` returns a URL at
`https://issuer.smartcollege.example/checkout/<id>`, which is not a payment and does not exist. The
ordered path needs a real charge, taken at a stated moment, with a stated rule for getting it back.

| Step | Who | What |
| --- | --- | --- |
| 1 | Quals | shows the fee, the period and the refund rule before any card is entered |
| 2 | issuer | creates a payment session for the request's fee |
| 3 | applicant | pays |
| 4 | issuer | confirms from the provider's callback, and reconciles from the return page if the callback is late |
| 5 | issuer | freezes the request, and sends the confirmation and the operator notice (P0-40) |
| 6 | issuer | on a declined request, returns the fee by the same rule the page stated |

## Decisions taken

**Payment is taken before the review, and the refund rule is stated before payment.** This is the
model the applicant already expects from a transcript order, and it is the only way the period can
start from an observable state. The cost is a refund liability, which is why the rule is printed
above the button rather than in the small print.

**The fee is configuration, not code.** Per institution, with a currency, defaulting to zero so the
test sites can exercise the whole path without money. A zero fee still goes through the same
confirmation and freeze steps, so the flow is exercised rather than branched.

**The account's existing provider is reused.** The academy's Stripe integration — encrypted keys in
`payment_config`, session creation, reconciliation from the return page — is the working pattern.
Quals gets its own credentials rather than reaching into the academy's database. See ADR-4.

**Settlement is deliberately out of scope.** Quals collects and the institution is settled out of
band for now, monthly, by reference. Building a payout model before the flow exists would be
building the wrong thing.

## What stays the same

- The academy's Stripe integration and its offer checkout are untouched.
- The issuer's existing (stub) checkout routes are left alone until this story replaces their use,
  so nothing that currently references them breaks mid-flight.
- The collection path does not know a fee was ever paid.

## Acceptance criteria

- The fee, the period and the refund rule are visible on the same screen as the payment action, and
  before it.
- A request cannot reach review without a confirmed payment; submitting unpaid is refused by the
  service, not only by the page.
- The provider's callback is verified, and confirming twice does not charge twice or create a second
  request.
- The return page reconciles when the callback is late, and does so idempotently.
- The amount stored on the request is the amount charged, in the currency charged.
- Declining a request records the refund obligation and the outcome of the refund, and the applicant
  is told.
- Failed payment leaves the request resumable rather than restarting identity verification.

## Verification

- Unit tests: amount and currency recorded, double confirmation is a no-op, refusal to submit unpaid.
- A scripted end-to-end in test mode with a zero fee and then a small real fee: pay, confirm, freeze,
  then decline and confirm the refund path.
- A reconciliation test that simulates a lost callback and asserts one request and one charge.
- A wording check that the refund rule is on the payment screen, because the rule is an acceptance
  criterion and not an implementation detail.
