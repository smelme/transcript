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

**The window is measured on the institution's data, never on the applicant's word.** The chooser
asks nothing; it only tells the applicant which door applies. Anyone who disagrees with the answer
can still take the second door.

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
| `issuer-frontend/app/lib/doors.js` | **New.** The two doors and the words for every answer, as a plain module so the wording can be checked without a browser |
| `issuer-frontend/app/api/eligibility/route.ts` | **New.** The server-side question. A registry that does not answer becomes `unknown`, never `no` |
| `issuer-frontend/app/get-credentials/page.tsx` | Rewritten as the decision point: both doors described first, then the question, then the door that applies |
| `issuer-frontend/app/page.tsx`, `app/credentials/page.tsx` | Both doors stated with their costs and waits, and both reachable |
| `scripts/check-decision.mjs` | **New.** 12 checks over the three outcomes and the copy rules |
| `scripts/check-doors-live.mjs` | **New.** 13 checks against the deployment: both doors stated on all three pages, no self-forwarding, and an unanswerable question coming back as `unknown` with a reason |

The copy rules the check enforces, because they are the acceptance criterion: only a `yes` reaches
the self-service door; no sentence contains "failed", "invalid", "denied", "rejected", "not
found", "no record" or "verification failed"; the window figure appears exactly once and the copy
states the same number the registry measures by; both doors always state their cost, wait and what
is needed; and every outcome that is not self-service offers the checked path by name.

**One deliberate departure.** The story's step 5 has the chooser present both doors on "the page
people read first". Both doors are now described on the home page *and* on `/get-credentials`
before the form, rather than only on the home page, because the page somebody actually lands on
from an email link is `/get-credentials`, and it should not be the one page that withholds the
alternative.

**What the responsive check still needs.** `scripts/check-responsive.mjs` reads the live sites, so
the new sections are checked at 360/390/768 after deployment rather than before it.
