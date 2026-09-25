# Business benefits at a glance. Qualification credentials

**Date:** 2026-09-20
**Companion to:** `business-case-qualification-credentials.md`
**Format:** bullets, with the figure in each one.

## How to read the numbers

Every figure is tagged, because a mixed list of measured and assumed numbers is worse than no list:

- **[system]** — a property of the built system. Verifiable in the repository; not an estimate.
- **[model]** — arithmetic from an assumption stated alongside it. Change the assumption, change the figure.
- **[to validate]** — an external figure that has **not** been measured here. It must come from the
  institution's or relying party's own records before it is quoted outside this document.

No market-size, adoption or pricing number in this document is measured. The system has no paying
customer yet. Where a figure looks like research, it is a placeholder with the method shown.

---

## 1. Speed

### Institutes (issuing institutions)

- **Issue to held:** minutes, not weeks. **[system]** An issuance session expires after **10 minutes**
  by default (`MDOC_SESSION_TTL_SECONDS`), so the claim loop — offer, sign-in code, consent, device
  binding — is designed to complete in minutes.
- **Verification of their credential:** seconds, and it never reaches them. **[system]** The verifier
  checks the signature, device auth and status locally; the status list is cached for **60 seconds**
  per issuer key, so a verification costs no issuer round trip at all.
- **Registrar involvement per verification request:** **0** for anything a relying party can check
  itself. **[system]**
- **Official transcript turnaround today, for comparison:** **2–5 business days** for an e-transcript
  and **3–10 days** by mail. **[to validate]** — replace with the institution's own service-level
  measurement.
- **Speed gain per request:** **~2–5 business days → seconds** for a check, and **minutes** for the
  holder to produce the document instead of waiting on the registrar. **[model]**, derived from the
  two lines above.

### Relying parties

- **My Jobs:** check time goes from days to **sub-second to low seconds**, bounded by one cached HTTP
  fetch of the status list rather than a human process. **[system]**
- **Trust University:** transcript evidence is available **at the point of application** instead of
  after a courier cycle, which pulls offers earlier in the cycle. **[system]** for the mechanism; the
  yield effect is **[to validate]**.
- **Failure clarity:** a revoked, unreachable-status, replayed or cancelled presentation fails closed
  with a plain-language message **immediately**, rather than after an investigation. **[system]**

### Holder (the customer)

- **Time to obtain their own record:** minutes from an emailed link or a scan. **[system]**
- **Time to share it with a third party:** minutes — email, one-time code (**10-minute** validity),
  terms, then the document or a PDF. **[system]**
- **Share link validity:** **30 days** by default (`SHARE_TTL_DAYS`), so the recipient is not racing a
  deadline. **[system]**
- **No fees and no couriers** to send their own document. **[system]**

### Throughput at scale

- **Status-list fetches collapse.** **[system]** With a 60-second cache, **10,000 checks in an hour
  against one issuer cost at most 60 fetches, not 10,000** — the cost of verification is effectively
  decoupled from the number of verifications.
- **Status-list size is negligible.** **[system]** One bit per credential (LSB-first packing, DEFLATE,
  base64url): **100,000 credentials = 12.5 KB raw before compression**, and that one list serves every
  verifier.

---

## 2. Cost savings

### Institutes

- **Registrar labour per manual transcript request:** **10–30 minutes** of administrative time.
  **[to validate]** — time one real request.
- **Implied labour cost per request:** **£3.30–£17.50**, at a loaded rate of £20–£35/hour.
  **[model]**, from the line above. The institution's own rate replaces it.
- **Repetitive verification enquiries reaching the registrar:** target **>80% reduction**, since a
  relying party that can verify locally has no reason to ask. **[to validate]** — measure the
  registrar inbox before and after.
- **Postage and courier per official document:** **£1–£5** domestic, **£5–£45** international
  courier. **[to validate]** — read it off the institution's postage ledger.
- **Credential storage cost:** **zero at rest.** **[system]** The mdoc bytes are never persisted; only
  a metadata row exists, so storage cost does not grow with credentials issued.
- **Fulfilment and document-handling:** replaced by an API call for any check a relying party performs
  itself. **[system]** for the mechanism; the saving is **[to validate]**.
- **Bulk issuance retyping:** removed for API-key clients, who issue into their own organisation
  directly. **[system]** Batch issue has been removed from the UI entirely, so the supported path is
  programmatic.

### Relying parties

- **Cost per check versus the incumbent:** the ceiling is whatever they pay today per check —
  **indicatively £15–£60** for a degree verification through a screening provider or clearinghouse.
  **[to validate]** — get it from their invoices; this is the single most findable number in the whole
  business case.
- **Document handling inbound:** no scanned transcripts to receive, store, redact or delete.
  **[system]**
- **Fraud losses avoided:** a forged or edited document **cannot pass signature verification**, so the
  successful-forgery rate for the document itself is **0**. **[system]** The residual risk moves to
  device theft, coercion and fraud at issuance time, which is a different control.
- **Re-work avoided:** an applicant who presents the wrong credential type is told plainly rather than
  producing a page of dashes — My Jobs already refuses anything that is not a completed award.
  **[system]**

### Quals (the service provider)

- **Marginal cost per credential stored:** **~£0.** **[system]** Nothing is persisted but metadata.
- **Marginal cost per verification:** **~£0** — local cryptography plus a status list that is already
  cached. **[system]**
- **Real cost of goods sold is support and integration**, not infrastructure. **[model]** — seven
  services, one SQLite volume and per-message email are the direct costs; the unbounded cost is human.
- **Consequence:** a free relying-party discovery tier is affordable, and price should be set by value
  rather than by cost. **[model]**

### Holder

- **Transcript and courier fees:** **£0** for a share. **[system]**
- **Time off work / postage / notarisation** to obtain and send a record: avoided. **[to validate]**

---

## 3. Revenue and business opportunities

### Unit economics that are grounded, not assumed

- **Storage per credential:** **0 bytes**. **[system]**
- **Status list per 100,000 credentials:** **12.5 KB raw**, compressed and served once. **[system]**
- **Issuer round trips per 10,000 verifications:** **≤60**. **[system]**
- **Issuer calls to check revocation:** **0 by design.** **[system]** This is what makes a per-check
  price sustainable and a free tier rational.

### Illustrative revenue model **[model]**

Drivers: institutions $N_I$ = 5; graduates per institution $G$ = 4,000; credentials per completion
$k$ = 1.3; issuance price $p_i$ = £1.50; share presented within a year $u$ = 15%; verifications per
presentation $v$ = 2.5; verification price $p_v$ = £2.50; subscription $S$ = £15,000/yr.

| Scenario | Institutions | Graduates/institution | Presented within a year | Revenue | Composition |
| --- | --- | --- | --- | --- | --- |
| Bear | 2 | 1,500 | 5% | **£37,069** | £30,000 subs + £5,850 issuance + £1,219 verification |
| Base | 5 | 4,000 | 15% | **£138,375** | £75,000 subs + £39,000 issuance + £24,375 verification |
| Bull | 20 | 5,000 | 30% | **£738,750** | £300,000 subs + £195,000 issuance + £243,750 verification |

- **Subscription is 54% of the base case with only 5 institutions.** **[model]**
- **Volume beats price.** Going 5 → 20 institutions adds **~£600,000**; doubling every price adds
  **~£63,000** to the base case. **[model]** Spend on distribution, not on price optimisation.
- **Break-even shape:** the base case covers a small team and infrastructure with **5 institutions**;
  the bear case does not. **[model]**
- **The gate is adoption, not margin** — at ~£0 marginal cost, the constraint is how many institutions
  sign and how much verification volume they generate. **[model]**

### Revenue lines available (with the payer)

- **Institution subscription** — annual, per institution. Predictable; sells to procurement. **[model]**
- **Issuance fee** — per credential, metered by the API key that already exists. **[system]** for the
  meter; price is **[to validate]**.
- **Verification fee or bundle** — charged to the relying party, priced against their incumbent
  per-check line. **[model]**
- **Accreditation / listing fee** — annual, for issuers to be listed and recognised by relying
  parties. **[model]**
- **Managed signing and status-list hosting** — annual plus per key operation; HSM, rotation,
  published key history, HA and an SLA. **[model]** This is the highest-margin, stickiest line and it
  removes the institution's two hardest duties.
- **Expedited completion (O-01)** — publication-ready credentials within 48 hours at a **30–50%
  premium**, where standard submission is 14+ days. **[to validate]** — the comparator is what the
  institution's programme partners already accept today.
- **Holder premium transactions** — expedited official delivery, legalisation/apostille packs,
  certified translations, lifelong vault after graduation, replacement after device loss. Per
  transaction, always optional. **[model]**
- **Aggregate, opt-in insight** — verification demand and outcome reporting for institutions, strictly
  aggregated with no PII. **[model]** Privacy-fragile; opt-in only, or do not do it.

### Payment mechanics already in place

- **A fee gate exists and is enforced.** **[system]** An issuance session with a fee returns
  **`402 Payment required`** until paid; the holder cannot claim it otherwise.
- **The payment provider is not connected** — checkout returns a placeholder URL and confirmation is a
  stub. **Wiring a PSP is the smallest piece of work in this list with the most immediate effect on
  monetisation.** **[system]**

---

## 4. Trust, risk and compliance benefits

- **Data disclosed per request:** scoped to the namespace requested. A transcript request discloses
  **2 of the 4 namespaces** the holder may carry. **[system]**
- **Sensitive identifiers carried: 0.** National insurance/SSN, ethnicity and residency are
  **deliberately not modelled at all**. **[system]**
- **Credential honeypot size: 0 documents.** **[system]** No server-side credential store, so a
  breach of the issuer yields metadata, not degrees.
- **Revocation is per credential and immediate** — the bits are derived from the registry on every
  request, so the published list cannot drift from the registry. **[system]**
- **Revocation is checked against the credential's own signer** — the verifier validates the list with
  the certificate that signed the presented credential, so **no new trust configuration is needed** to
  add an issuer. **[system]**
- **Unverifiable credentials are refused, not accepted.** A credential with no status reference, or an
  unreachable list, **fails** rather than passing silently. **[system]** A deliberate fail-closed
  choice; it trades availability for assurance.
- **Issuer governance is enforceable:** a **0–100 trust score** (default **50** = neutral), with
  approve and block, and an audit entry for every change. **[system]**
- **Reader authentication is cryptographically signed** by the verifier as a COSE_Sign1 (ES256),
  identified by a JWK thumbprint with **no CA required**. **[system]**
- **Presentment channels already supported: 4** — QR, same-device app link, DCAPI in the browser, and
  an emailed share link. **[system]**
- **Automated coverage behind the claims:** **76 issuer, 61 verifier and 27 wallet** tests green at the
  last recorded pass, including negative paths for revoked, tampered, unreachable and replayed
  presentations. **[system]**

---

## 5. Scale properties — why the economics hold as volume grows

- **Verification cost is flat in volume:** ≤1 list fetch per issuer per 60 seconds. **[system]**
- **Storage cost is flat in credentials issued:** nothing but metadata is persisted. **[system]**
- **Revocation cost is flat in credentials revoked:** one bit flips; the list is derived on request.
  **[system]**
- **Adding an issuer requires no verifier configuration change:** the trust root travels with the
  credential. **[system]**
- **Adding a relying party requires no issuer involvement:** it creates its own session. **[system]**
- **The one thing that does not scale for free:** support. Holder device loss, recovery and consent
  friction grow with holders, not with contracts. **[model]** Budget for it, or it becomes the margin.

---

## 6. Assumptions register

| Figure | Value used | Tag | How to validate |
| --- | --- | --- | --- |
| Registrar time per manual request | 10–30 min | [to validate] | Time one real request end to end |
| Loaded administrative rate | £20–£35/hr | [to validate] | The institution's own finance figure |
| Postage / courier | £1–£5 domestic, £5–£45 international | [to validate] | The institution's postage ledger |
| Incumbent cost per verification | £15–£60 | [to validate] | The relying party's own invoices — most findable number here |
| Share of credentials presented within a year | 15% | [to validate] | Measure in the first pilot cohort |
| Verifications per presented credential | 2.5 | [to validate] | Measure in the first pilot cohort |
| Issuance price | £1.50 | [to validate] | Willingness-to-pay interviews, priced two ways |
| Verification price | £2.50 | [to validate] | Compared against the incumbent per-check line |
| Institution subscription | £15,000/yr | [to validate] | Procurement interviews |
| Institution count / graduate volume | 5 institutions, 4,000 graduates | [to validate] | Institution registry figures; sales pipeline |
| e-transcript / mail turnaround today | 2–5 days / 3–10 days | [to validate] | The institution's published service levels |
| Expedited premium | 30–50% | [to validate] | What programme partners already accept |

## 7. The three numbers that decide it

1. **Issuing organisations** — supply. Everything else is downstream.
2. **Verifications per thousand holders** — demand, and the only proof the relying-party side works.
3. **Credential-claim completion rate** — the funnel that converts an issued credential into a
   usable one. Below an acceptable threshold, stop selling and fix the funnel first.
