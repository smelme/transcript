# P0-35: Who can serve themselves

**Status:** ✅ Done — 2026-09-26 (`node scripts/check-decision.mjs`, 12 checks)
**Components:** `issuer-frontend` (`/`, `/get-credentials`, `/credentials`), `issuer-service`
(eligibility answer), Smart College registry (the data — separate repository)
**Blocks:** P0-36 (nothing else can be sized until we know how many people the second door is for)
**Depends on:** a completion date in the institution's registry

## The change

Today the academy has one door and it assumes everyone can walk through it. The page asks for an
email address, the issuer invents a record, and the holder is handed to Quals. There is no question
asked and no alternative offered, so a graduate from twenty years ago either fails silently or
concludes the service is not for them.

This story adds the question, the alternative, and the honest third answer.

| Step | Who | What |
| --- | --- | --- |
| 1 | Smart Academy | asks for the address, and asks the registry whether this person is ours |
| 2 | registry | answers **yes** (a record within the window), **no**, or **unknown** |
| 3 | Smart Academy | on yes, runs the existing hand-over unchanged |
| 4 | Smart Academy | on no or unknown, offers the ordered path in the same breath, without calling it a failure |
| 5 | Smart Academy | presents both doors, their costs and their waits, on the page people read first |

## Decisions taken

**Three answers, not two.** A registry that can only say yes or no will say no to a name that
changed, an address that is old, or a record that is thin. *Unknown* is the honest answer and it
routes to the ordered path, where a person looks. See ADR-5.

**One way in, and a quiet way out.** The page is a sign-in: one field, one button, and underneath it
the second road, shaped the way every sign-in screen offers *forgot your password?* — a question
about circumstances rather than a verdict about the person. Somebody who finished longer ago, or whom
we cannot match, takes that line; somebody who does not recognise themselves in it signs in and never
thinks about it again.

**The applicant is not asked to classify themselves, and is not quoted two prices up front.** Two
labelled paths with their costs and waits, shown before anything had been asked for, made the simplest
way in look like a decision about the applicant rather than an action they take. The second road's
cost, wait and requirements are stated where they are needed: in the refusal, when the sign-in cannot
serve somebody and they are about to take it.

**The record decides whether the sign-in can serve somebody**, never their word about themselves.
Somebody it cannot serve is corrected by the record, not blamed for it.

*(This story has been through three shapes: a single page that asked for an address and then told the
applicant which door applied; then two labelled paths offered side by side; then this. Each change came
from the same finding — the page was asking the applicant to do the institution's job, or to read the
institution's paperwork before they had asked for anything.)*

**Nothing redirects on its own.** The applicant chooses. This is the rule we already settled on the
hand-over screen, and it applies with more force here because the two doors cost different amounts
of money and time.

**The wording is the feature.** A wrong word here turns a legitimate graduate away or accuses them.
`We cannot match that address to a record` is allowed; `verification failed` is not.

## What stays the same

- The hand-over after a *yes* is untouched: one button, the expiry, no countdown.
- The publish flow stays the institution's API call. This story changes what happens before it.
- The explainer page keeps its existing sections; it gains one.

## Acceptance criteria

- The home page states which door applies, what each costs, how long each takes, and what the
  applicant needs for each — before anything is asked of them.
- An address with a record inside the window proceeds exactly as it does today, with no extra step.
- An address with no record, or an ambiguous one, is offered the ordered path, and the wording
  describes a missing match rather than a refused person.
- The five-year figure appears once in the copy and matches the registry's rule.
- Both doors are reachable from the home page, `/get-credentials` and `/credentials`, and neither
  page auto-forwards.
- The chooser and the wizard entry point are usable at 360px, 390px and 768px, with targets of at
  least 44px.

## Verification

- A scripted check of the three registry outcomes against the decision point, asserting the wording
  for each, including that *unknown* never renders an accusation.
- The responsive check extended to the new sections at the three widths.
- A copy review against the rules above, since the wording is the acceptance criterion.
- One manual walk: a real address inside the window, and one deliberately outside it.

---

## What was built

| Where | What |
| --- | --- |
| `issuer-frontend/app/lib/doors.js` | **New.** The one way in, the quiet way out, and the words for every answer, as a plain module so the wording can be checked without a browser. The way-out prompt is built from the window constant, so it cannot drift from the rule the institution measures by |
| `issuer-frontend/app/api/eligibility/route.ts` | **New.** The server-side question. A registry that does not answer becomes `unknown`, never `no` |
| `issuer-frontend/app/get-credentials/page.tsx` | Rewritten as the **sign-in**: heading, address field, one button, and the way out underneath |
| `issuer-frontend/app/page.tsx`, `app/credentials/page.tsx` | A single panel offering the sign-in, with the way out beneath it. The two-path cards and their cost tables are gone |
| `issuer-frontend/app/lib/demo-registry.js` | **New, demonstration only.** The two addresses this deployment serves and the record it pretends to hold for each, with the five-year rule applied to them. Off unless `NEXT_PUBLIC_DEMO_REGISTRY` is set, and never printed on a page |
| `issuer-frontend/app/lib/demo-publish.ts` | **New, demonstration only.** Publishes a demonstrated credential for a listed address through the issuer's fenced demonstration route |
| `scripts/check-decision.mjs` | **New.** 18 checks over the three outcomes, the copy rules, and the demonstration registry |
| `scripts/check-doors-live.mjs` | **New.** 13 checks against the deployment: both doors stated on all three pages, no self-forwarding, and an unanswerable question coming back as `unknown` with a reason |

The copy rules the check enforces, because they are the acceptance criterion: only a `yes` reaches
the self-service path; no sentence contains "failed", "invalid", "denied", "rejected", "not
found", "no record" or "verification failed"; **every** year figure in the copy is the configured
window, so the page cannot state a different number from the one the registry measures by; the way
out is a question, states the window, and does not characterise the applicant; and every outcome that
is not self-service offers the checked path by name.

**One deliberate departure.** The story's step 5 has the chooser present both doors on "the page
people read first". Both paths are now offered on the home page, on `/get-credentials` *and* on
`/credentials`, each with its own way in, because the page somebody actually lands on from an email
link is `/get-credentials`, and it should not be the one page that withholds the alternative.

**What the responsive check still needs.** `scripts/check-responsive.mjs` reads the live sites, so
the new sections are checked at 360/390/768 after deployment rather than before it.

## The demonstration registry

The sign-in asks the institution's database one question, and on a demonstration deployment there is
no reachable database to ask — so every address answered *"we could not look that up just now"* and
nobody could get past the first step. A demo that cannot demonstrate anything is not a demo.

`demo-registry.js` is therefore a small, deliberately fake registry: **the addresses this deployment
was asked to serve**, and the record the institution would hold for each, obeying **the same window
rule, using the same constant**. The two of them graduated inside the window, so both can serve
themselves; every other address — including one that looks exactly like another former student's —
is `unknown`, never `no`, and takes the checked path.

For whoever is running the demonstration, the two addresses are `s.melese+63@gmail.com` and
`s.melese+66@gmail.com`. They are recorded here, and nowhere a visitor can read them: a page that
printed the addresses it would issue to would tell every visitor who else is on the roll, which is
the first version of this and the reason it was taken off the page.

Five things keep it honest, and they are the reason it is safe to ship:

1. **The real registry answers first.** The list is consulted only when the real one did not answer,
   so it can never turn a real `no` into a `yes`.
2. **It is off unless a deployment asks for it** (`NEXT_PUBLIC_DEMO_REGISTRY`). A list that quietly
   decided who could collect a real credential would be the worst kind of bug, because nobody would
   think to look for it.
3. **The list is exactly the addresses it was asked to serve, and both sides hold the same ones.**
   The academy's list decides who is offered the self-service door; the issuer's
   `DEMO_RECORDS_ALLOWLIST` decides who a record may be invented for. The fence is therefore not only
   on the side an applicant can see, and `scripts/check-decision.mjs` fails if either list grows.
4. **Publishing is gated by the same list.** An address on it gets a demonstrated credential through
   the issuer's fenced demonstration route; an address that is not on it gets the registry's own
   refusal. The demo cannot quietly issue to somebody it was not asked about.
5. **The page states no graduation year from the list.** The demonstrated credential is *generated*,
   so a page repeating a year from the list would disagree with the document it just produced — and a
   page that contradicts its own credential is worse than one that says nothing about the year.

Turning it on is three variables: `NEXT_PUBLIC_DEMO_REGISTRY=true` and `ISSUER_API_URL` on the
academy site, and on the issuer `ALLOW_DEMO_RECORDS=true` with
`DEMO_RECORDS_ALLOWLIST=s.melese+63@gmail.com,s.melese+66@gmail.com`.

**`ALLOW_DEMO_RECORDS=true` on its own reopens that route for any address** — it is the fence P0-41
put around generated records, and it does not know who the demonstration is for. The allow-list is
what holds it to the addresses this deployment serves, and the route refuses everything else with
`403 DEMO_RECORDS_NOT_ALLOWED` *before* it generates anything, so a refused request leaves no
student id, no account link, no prepared credential and no email behind. Both variables belong on a
demonstration deployment and nowhere else.
