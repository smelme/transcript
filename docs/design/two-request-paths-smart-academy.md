# Two request paths on Smart Academy

**Status:** Proposed
**Surface:** `issuer-frontend` (Smart Academy: `/`, `/get-credentials`, `/credentials`) and
`quals-frontend` (`/issue` entry and the new `/request` wizard)
**Related:** `docs/analysis-discovery/alumni-order-model-discovery.md`,
`docs/architecture/alumni-manual-request-architecture.md`

## The principle to copy from UCLA

UCLA's page works because of five editorial choices, not because of its layout:

1. It says **which door applies to you** in the first two bullets, before anything else.
2. It states **why** the second door is slower — status must be confirmed — instead of hiding it.
3. It **names the third party** and calls it the official agent, so it is not a surprise later.
4. It puts **fees and delivery** in their own sections rather than burying them in a form.
5. It **names the exceptions** (Dentistry, Law, Medicine, Extension) instead of letting people
   discover them by failing.

Everything below is those five choices applied to our pages, in our own words.

## `/` — the home page

The page today has one action, *Get your digital credentials*, and a three-step "How it works" that
only describes the self-service route. Someone who graduated in 2010 reads it and either fails at
the email step or assumes the service is not for them.

**Change:** replace the single action with a chooser, and turn the single three-step track into two
short tracks. The hero, the feature grid and the closing panel stay as they are.

### New section, placed directly under the hero

> ## Which applies to you?
>
> **You studied with us in the last five years**
> Sign in with the email address we hold for you and collect your credentials in a few minutes.
> [Get your digital credentials]
>
> **It is longer ago than that, or you are not sure**
> Ask us for them instead. You will confirm your identity, tell us what you need, and pay the fee.
> We send the request to the registry, and you will have an answer within **10 working days**.
> [Ask for your credentials]
>
> Not sure which you are? Use the second one. If we still hold your record, the first door will
> recognise you and you can come straight back.

Notes for whoever builds it:

- Two cards, equal weight, stacked on a phone and side by side from 720px. Reuse `.feature-grid`
  and `.feature`; no new decorative icon, only the existing `.feature-rule` hairline.
- Both actions are real links. Nothing redirects on its own — the holder must choose, which is the
  rule we already settled on the hand-over screen.
- The five years must be the same number the registry uses. It appears here once; if it changes, it
  changes in one place.

### "How it works" becomes two tracks

> **If we still hold your record**
> 1. Enter the email address we hold for you.
> 2. We prepare your qualification and your transcript.
> 3. Open the link, and add them to your wallet.
>
> **If you need to ask**
> 1. Confirm who you are with a photo ID and a selfie.
> 2. Tell us your address, the school, and what you need.
> 3. Pay the fee. We send it to the school and reply within 10 working days.
> 4. When it is agreed, you get a link just like the one above.

### Two short factual sections, modelled on UCLA's

> ## Fees and how long it takes
>
> | | Self-service | Asking us |
> | --- | --- | --- |
> | What it costs | No charge | The fee is shown before you pay |
> | How long | A few minutes | Up to 10 working days from payment |
> | What you need | The email address we hold | Photo ID, a selfie, and a payment card |
>
> The 10 working days is the time to process the request. Nothing is issued until the school has
> confirmed your record.

> ## When we cannot confirm your record
>
> If we cannot find you, or the details do not match what we hold, we will tell you what we need
> next. We may ask for another document. If we still cannot confirm it, we return the fee.

## `/get-credentials` — the self-service door

The page today asks for an address and hands the holder to Quals. That is right. It needs one
addition: the escape hatch, in the same voice, for the person the lookup will not recognise.

**Change:** keep the single field and the single button. Under the button, add:

> If you studied with us more than five years ago, or you are not sure, [ask us for your
> credentials instead]. It takes up to 10 working days once the school has confirmed your record.

And change what happens on the result. Today the page always says the credentials are ready. With a
registry in front of it, there are three outcomes and each is stated plainly:

| Outcome | What the page says |
| --- | --- |
| We hold the record | The existing hand-over, unchanged: *Your credentials are ready*, one button, the date they are held until |
| We do not | *We do not hold a current record for that address.* One line of explanation — you may have used a different address, or it may be longer ago — and one button: *Ask us for your credentials* |
| We cannot tell | Same as *we do not*, worded as the first case, and never as a refusal. No mention of fraud, mismatch or failure |

## `/credentials` — the explainer

Add one section, after the existing "how it works" material, because this is the page a suspicious
relative reads before starting:

> ## If it has been a long time
>
> Records older than five years are still ours, but we cannot always match an email address to them
> on its own. When that happens, you can ask for the credential instead: you confirm your identity,
> tell us what you need, and we check the record by hand. It takes up to 10 working days, and there
> is a fee.
>
> The credential you receive is identical either way. It is signed by Smart Academy, it can be
> verified by anyone you share it with, and you can revoke the sharing at any time.

## Quals `/issue` — the door for people who did not come through an invitation

The issuing page currently starts from either an invitation link or an email address. Add the
ordered path as a first-class entry rather than an error state:

- On the sign-in stage, beneath the code button: *I do not have an invitation. [Ask for a
  credential]* — pointing at the wizard, and carrying the address if one was typed.
- The wizard lives at `/request` on the Quals front end: identity, then details, then payment, then
  the confirmation. Phone-first, one question per screen, a progress indicator, and a back link at
  every step.

### The confirmation the applicant is owed

After payment, one screen and one email saying the same thing, in this order:

> **Your request has been sent**
>
> What happens next:
> - We have sent your request to Smart Academy.
> - They confirm your record, and we issue the credential to you.
> - This takes up to 10 working days. We will email **{delivery address}** either way.
>
> Your reference is **{reference}**. [See the status of this request]
>
> If it is declined, we return the fee to the card you paid with.

The status page then carries the same reference and one of five short states: *received*, *being
checked*, *accepted and being prepared*, *sent to you*, *declined*. No progress bars, no invented
percentages, no countdown — the same rule we applied to the hand-over screen.

## Copy rules for all of this

- Name the institution, not "we", when the institution is the one doing something, and name Quals
  when Quals is. Both appear on one page for the first time in this flow, which is where confusion
  starts.
- Never accuse. *We cannot match that address to a record* is a fact; *verification failed* is a
  verdict.
- Never promise a date the system cannot keep. The 10 working days appears only where a person is
  responsible for it, and the page says nothing is issued until the school confirms.
- Money and time are stated before the payment, never after.
- No new decorative icons, and no illustration that does not explain something. Reuse
  `.feature-grid`, `.steps`, `.panel`, `.notice`, `.btn`.
- Phone-first: the chooser stacks, targets are at least 44px, and the wizard is checked at 360px,
  390px and 768px with the existing `scripts/check-responsive.mjs`.

## What must be decided before the copy is final

| Decision | Blocks |
| --- | --- |
| The fee, and whether it is returned on decline | The home page fee table, the wizard, the confirmation |
| Whether "10 working days" runs from payment or from acceptance | The home page, the confirmation email, the portal's ageing clock |
| The anchor date for "five years" (graduation, or last term attended) | The chooser's wording and the registry query |
| Whether a request can ask for both credentials at once | The wizard's "what do you need" step and the CSV row contract |
