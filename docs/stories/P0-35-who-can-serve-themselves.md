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

**The applicant picks their path; the record decides whether it can serve them.** The two ways in
are named by when somebody studied — *in the last five years* and *more than five years ago* — and
both are offered side by side with their costs and waits. That is the one thing the applicant knows
without being asked and the only thing either path turns on, so nothing is put in front of the
choice. The institution's records still have the last word: somebody who takes the first path whose
record is older than the window, or cannot be matched, is sent down the second one rather than turned
away. Offering the paths is not the same as promising the answer.

*(This story first specified a single page that asked for an address and then told the applicant
which door applied. That put a question in front of a decision they could already make, and it read
as a verdict on them. The two paths are now chosen, not assigned.)*

The window is measured on the institution's data, never on the applicant's word — including when
they choose the wrong path, which corrects them rather than blaming them.

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
| `issuer-frontend/app/lib/doors.js` | **New.** The two paths and the words for every answer, as a plain module so the wording can be checked without a browser. The path labels are built from the window constant, so they cannot drift apart |
| `issuer-frontend/app/api/eligibility/route.ts` | **New.** The server-side question. A registry that does not answer becomes `unknown`, never `no` |
| `issuer-frontend/app/get-credentials/page.tsx` | Rewritten as the **first path**: its heading names it, it is where the address is entered, and the second path is linked from it throughout |
| `issuer-frontend/app/page.tsx`, `app/credentials/page.tsx` | Both paths, each a card with its own link |
| `scripts/check-decision.mjs` | **New.** 13 checks over the three outcomes and the copy rules |
| `scripts/check-doors-live.mjs` | **New.** 13 checks against the deployment: both doors stated on all three pages, no self-forwarding, and an unanswerable question coming back as `unknown` with a reason |

The copy rules the check enforces, because they are the acceptance criterion: only a `yes` reaches
the self-service path; no sentence contains "failed", "invalid", "denied", "rejected", "not
found", "no record" or "verification failed"; **every** year figure in the copy is the configured
window, so the page cannot state a different number from the one the registry measures by; both
paths are recognisable by timeframe and state their cost, wait and what is needed; and every outcome
that is not self-service offers the checked path by name.

**One deliberate departure.** The story's step 5 has the chooser present both doors on "the page
people read first". Both paths are now offered on the home page, on `/get-credentials` *and* on
`/credentials`, each with its own way in, because the page somebody actually lands on from an email
link is `/get-credentials`, and it should not be the one page that withholds the alternative.

**What the responsive check still needs.** `scripts/check-responsive.mjs` reads the live sites, so
the new sections are checked at 360/390/768 after deployment rather than before it.
