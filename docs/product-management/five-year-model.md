# Five-year model. Illustrative, with the assumptions exposed

**Date:** 2026-10-03 · Companion to `business-model-one-pager.md`
**Currency:** £. **Status:** all prices and volumes are modelling assumptions, not research. The
system has no paying customer. Every figure below is arithmetic you can re-run with better inputs.

## 1. What is actually known, and what is not

| Item | Confidence | Value used here |
| --- | --- | --- |
| Official transcript fee an institution charges | **Observable** — published by institutions | £10–£20 per transcript |
| Registrar labour per manual request | **Estimable** — time one request | 15 min at £30/hr loaded = £7.50 |
| Delivery cost of a digital credential | **Known** — nothing is stored or posted | ~£0 |
| What a background checker charges an employer for a degree check | **Observable** — published pricing | £20–£60 retail |
| What the checker pays wholesale for that verification | **Not known — must be sourced** | £3.00 modelled |
| Share of an alumni base requesting a transcript each year | **Not known — must be measured** | 8%/yr of alumni stock |
| How many verifications an institution generates per year | **Not known — must be measured** | 7,000 at maturity |
| Institutional willingness to pay | **Not known — must be tested** | £25,000/yr |

**The single most valuable hour of work available:** ask one registrar for last year's transcript
request count and one employer for its per-check invoice. Both numbers replace an assumption below,
and both are trivial to obtain.

## 2. The unit model — one institution

Demand comes from the **stock of alumni**, not the annual graduating class. That distinction matters:
a university awarding 4,000 degrees a year has a much larger body of people who may need a
transcript.

| Input | Value |
| --- | --- |
| Completions per year | 4,000 |
| Alumni base | 80,000 |
| Transcript requests per year (8% of alumni) | 6,400 |
| Credentials issued per year (as adoption matures) | 4,940 |
| Verifications per year (transcript checks + employer checks) | 7,000 |

## 3. The institution's own economics — the sale that has to work first

| Per year, one institution | Today | With the platform |
| --- | --- | --- |
| Transcript fee income (6,400 × £12) | £76,800 | £76,800 |
| Registrar labour (6,400 × £7.50) | −£48,000 | ~−£2,000 |
| Postage, vendor and handling | −£12,800 | ~−£1,000 |
| Platform subscription | — | −£25,000 |
| Issuance fees (4,940 × £2.50) | — | −£12,350 |
| **Net contribution** | **£16,000** | **£36,450** |

The institution is roughly **£20,000 a year better off**, and its students wait minutes instead of
days. That is the whole sale, and it works before any of the Quals-side revenue is considered.

## 4. Quals — five-year profit and loss

Institutions on the platform (average during the year): 1.5 · 6 · 14.5 · 29 · 49.
Adoption of digital issuance rises from 30% of completions to 95% over the period.

### Revenue (£000)

| Line | Y1 | Y2 | Y3 | Y4 | Y5 |
| --- | --- | --- | --- | --- | --- |
| Institution subscriptions | 38 | 150 | 363 | 725 | 1,225 |
| Issuance fees | 6 | 39 | 132 | 320 | 605 |
| Verification fees | 7 | 54 | 196 | 479 | 1,029 |
| Managed signing and hosting | 4 | 14 | 35 | 70 | 118 |
| Holder premium transactions | 2 | 9 | 22 | 45 | 75 |
| **Total revenue** | **56** | **267** | **747** | **1,638** | **3,052** |

### Cost (£000)

| Line | Y1 | Y2 | Y3 | Y4 | Y5 |
| --- | --- | --- | --- | --- | --- |
| Team (FTE) | 360 (4) | 630 (7) | 990 (11) | 1,350 (15) | 1,710 (19) |
| Hosting, storage, email | 20 | 45 | 80 | 130 | 200 |
| Support and onboarding | 15 | 45 | 90 | 140 | 200 |
| Security, key custody, tooling | 20 | 30 | 40 | 60 | 70 |
| Legal, audit, insurance | 15 | 20 | 20 | 30 | 30 |
| **Total cost** | **430** | **770** | **1,220** | **1,710** | **2,210** |

### Result (£000)

| | Y1 | Y2 | Y3 | Y4 | Y5 |
| --- | --- | --- | --- | --- | --- |
| Revenue | 56 | 267 | 747 | 1,638 | 3,052 |
| Cost | 430 | 770 | 1,220 | 1,710 | 2,210 |
| **EBITDA** | **−374** | **−503** | **−473** | **−72** | **+842** |
| Cumulative | −374 | −877 | −1,350 | −1,422 | −580 |

**Reading of the shape**

- Break-even arrives **during year 5**, with year 4 close to flat.
- **Peak funding requirement ≈ £1.4m**, at the end of year 4. That is the number to raise or avoid.
- Year 5 revenue is **54% subscription**, 34% usage (issuance + verification), and the rest add-ons —
  so the model is not dependent on a single line.
- **Break-even needs roughly 36 institutions** at these prices. That is 0.5% of the addressable
  institutions in a single large market, which is the encouraging part.

## 5. Sensitivity — what actually moves the answer

| Scenario | Y5 revenue (£000) | Y5 EBITDA (£000) | Institutions needed to break even |
| --- | --- | --- | --- |
| **Base** | 3,052 | +842 | ~36 |
| Verification priced at £1.50 instead of £3.00 | 2,538 | +327 | ~43 |
| Subscription £15k instead of £25k | 2,562 | +352 | ~45 |
| **Only 30 institutions instead of 60** | 1,526 | **−684** | ~85 — does not work |
| All three adverse together | 1,023 | −1,187 | Not reachable in 5 years |

**The conclusion is unambiguous: the number of institutions is the dominant variable.** Halving
every price is survivable; halving the institution count is not. Spend on distribution, onboarding
and integration — not on price optimisation.

## 6. What must be true for the base case

1. **Institutions buy.** At least 36 within five years, each gained through a registrar-led sale in
   which the institution's own economics (Section 3) are positive in year one.
2. **Verification volume materialises.** Relying parties must integrate — this is the least proved
   part, and currently the least built (verification usage is not even recorded durably today).
3. **Verification holds its price.** The whole case rests on a check being worth £3 to an organisation
   that today pays considerably more for a slower one.
4. **Support cost per institution stays near £4k a year.** Above ~£10k the unit economics invert,
   because support — not infrastructure — is the real cost of goods sold.
5. **No step-change in standards** that hands distribution to a party that does not pay you.

## 7. How to replace these assumptions

| Assumption | Replace with | Source | Effort |
| --- | --- | --- | --- |
| Transcript requests per year | The registrar's actual count | One institutional interview | Hours |
| Registrar labour per request | A timed observation | Same interview | Hours |
| Verification volume per institution | Count of employer/admissions checks | Same, plus an employer | Days |
| Verification price | Per-check invoice from a checker or employer | One employer | Days |
| Willingness to pay | Two paid pilots, priced two ways | Two institutions | Weeks |
| Holder premium uptake | Pilot measurement | Live cohort | Months |

Until the first four rows exist, treat Section 4 as a shape rather than a forecast — what it
establishes is the *structure*: subscription-led, usage-amplified, support-limited, breaking even at
a few dozen institutions.
