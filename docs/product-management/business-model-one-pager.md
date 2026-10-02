# Business model. One page

**Date:** 2026-10-03 · **Companion to:** `business-case-qualification-credentials.md`
**Basis:** the implementation as it stands today. Status tags: **built**, **partial**, **missing**.

## The product in one line

Not software and not cryptography — **the machine-checkable signature of an institution**. A
credential's trust is established once, at issuance, then checked arithmetically at every use,
without the institution being involved in the check.

## What the implementation already gives you commercially

| Capability in the code | Commercial meaning | Status |
| --- | --- | --- |
| Client organisations + API keys per institution (`client_orgs`, `api_keys`) | Multi-tenant already. The API key is the natural **metering unit**, and the institution is stamped from the key so one org cannot issue as another | **built** |
| `credentials` table, durable, scoped per institution | The **issuance meter is billable today** — a real count per organisation that survives restarts | **built** |
| Issuance fee: `feePence` + `402 Payment required` until paid | A paywall mechanic exists. But the price is **caller-supplied**, there is no pricing table and no payment provider behind it | **partial** |
| Organisation-scoped admins, API-key management, audit log, portal | Enterprise administration is done, so a per-institution contract can be administered without engineering | **built** |
| Share flow: one-time session, OTP, terms, PDF, 30-day TTL | A stand-alone **document-delivery service** — monetisable per transaction, independent of the RP side | **built** |
| Trust registry: 0–100 trust score, approve/block, audit | The seed of a **governance/accreditation** product — but held **in memory**, so it resets on every deploy | **partial** |
| Verifier: `relyingPartyId`, `/verify/statistics`, verification log | A per-relying-party **verification meter** exists — also **in memory**, so usage is lost on restart and cannot be billed | **partial** |
| Status list: 1 bit per credential, 60 s cache, no issuer call | **Marginal cost per verification ≈ 0**, which is what makes a free relying-party tier rational | **built** |
| mdoc bytes never persisted | Storage cost **flat in credentials issued**; no honeypot to breach | **built** |

## Who pays, and for what

| Payer | Buys | Price hypothesis | Meter that exists today |
| --- | --- | --- | --- |
| **Institute** | Verifiable credentials for its own awards; less document handling; alumni revenue | Annual subscription + per credential | Issuance count (durable) |
| **Relying party** (My Jobs, Trust University) | Instant, unforgeable checks; decisions instead of documents | Free tier + annual bundle | None durable — **must be built** |
| **Holder** | Portability, privacy, no fees or couriers | Free to hold; premium per transaction | n/a |
| **Both sides** | Accreditation and listing; managed signing; status-list hosting with an SLA | Annual | n/a |

## The model I would run

1. **Institution:** subscription + per-credential issuance, sold against handling-cost reduction and
   new alumni revenue.
2. **Relying party:** free discovery tier + paid bundle, priced against the incumbent per-check line.
   Free is affordable because marginal cost is ~0.
3. **Holder:** free to hold and share. Premium **transactions** only — expedite, legalisation,
   translation, lifelong vault, recovery.
4. **Infrastructure:** managed signing and status-list hosting as a paid add-on. Highest margin,
   stickiest, and it removes the institution's two hardest duties.
5. **Governance:** accreditation and listing fees, once more than a handful of issuers exist.

## Unit economics

- ~**£0** marginal cost per credential stored; ~**£0** per verification.
- The real cost of goods sold is **integration and support**, not infrastructure. Budget it as the
  dominant cost per institution, or it eats the margin.
- Illustrative base case (5 institutions, 4,000 graduates each, 15% presented): **~£138k**, of which
  **54% subscription**. Bear ~£37k, bull ~£739k.
- **Volume beats price:** 5 → 20 institutions adds ~**£600k**; doubling every price adds ~**£63k**.
  Spend on distribution and integration, not price optimisation.

*All prices and volumes are hypotheses. There is no paying customer yet.*

## What is missing before anyone can be charged

| Gap | Why it blocks revenue | Effort |
| --- | --- | --- |
| No payment provider (checkout is a placeholder, confirmation a stub) | The paywall exists but no money can move | **S** |
| No pricing table or per-organisation default price | Price is caller-supplied, so it is not a commercial construct | **S** |
| Verification events and statistics are in memory | Relying-party usage cannot be metered, so that revenue line cannot be billed | **M** |
| Trust registry is in memory | The accreditation product and issuer governance reset on deploy | **M** |
| No plan, entitlement, invoice or dunning concept | Cannot sell to procurement or collect recurring revenue | **M** |

## The three numbers that decide it

**Issuing organisations** (supply) · **verifications per thousand holders** (demand) ·
**credential-claim completion rate** (the funnel that turns an issued credential into a usable one).

## The decision being asked for

Fund **Wave 0**: make the paywall real (payment provider + a pricing table), and make the
**verification meter durable** so the relying-party line can be priced and billed. Those three items
are the smallest work between the current implementation and a business that can invoice anyone.
