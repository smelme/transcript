# P0-34 — The shape of a credential follows the programme, not the applicant

**Status:** Open — rule agreed, implementation next
**Answers:** P0-33 (kinds stay; the *choice* goes)

## The rule

The institution provides the credential, and what it contains is decided by the state of the
programme the student is on:

| Programme state | What is issued | Kind |
| --- | --- | --- |
| Complete, student graduated | Qualification **and** transcript, in **one** document | `both` |
| In progress | Transcript only, for the courses completed so far | `transcript` |
| A certification (e.g. a six-week programme) | Qualification only | `qualification` |

The applicant never chooses. Today they do: `get-credentials/page.tsx` shows a picker with three
options and sends `include` to the issuer, which passes it straight to `requestedKinds`. The rule
replaces that with a fact about the record.

## What is wrong today, beyond the picker

- `PROGRAMMES` in `credential-generator.js` holds eight degrees — four bachelors and four masters —
  and **no certification**, so the third case cannot even be expressed.
- Nothing in the generated record says whether the student has graduated ✗. A record is synthesised
  from a seed and always looks complete, so "half way through" has no representation.
- An in-progress transcript would need the courses **completed so far** — a couple of semesters —
  not the full programme's list, which is what the generator produces now.
- The picker's own description of `both` reads *"Two credentials, held separately so you can
  present one without the other."* That is not what happens: one document is issued holding both,
  and the wallet filters by namespace at presentation. The copy is wrong, not just redundant.

## The Smart Academy examples

The demo should hold exactly these three, and nothing that does not fit the rule:

1. **Bachelor, completed** — a graduated student, issued the combined qualification and transcript.
2. **Master, in progress** — partway through, issued a transcript for the semesters completed.
3. **Certificate, six weeks** — issued a qualification only.

## Work

- `credential-generator.js`: give a programme an explicit state (completed / in progress /
  certification) and derive the kind from it in one pure function, tested on its own. Add a
  certificate programme with its own short course pool, and let an in-progress record generate only
  the semesters completed.
- `index.js` (academy request, ~line 1978): stop reading `include` from the request; derive it from
  the record. The `recognition` option stays — it is independent and already documented as such.
- `get-credentials/page.tsx`: remove the picker and say what the institution will issue instead. The
  claim page keeps working, since it already filters by the namespaces a credential holds.
- `issuer-service/tests/issuer-service.test.js`: the 44 kind assertions become assertions about
  programme state — one per case, plus the unrecognised-input path if any input remains.
- `issuer-service/scripts/test-academy-flow.mjs` and `smoke-share-transcript.mjs` assert the old
  transcript path; update them with the rule.
- Wallet: nothing. It already copes with a qualification-only credential and with a transcript-only
  one, and it stopped showing a kind label when there was nothing useful to say.

## Data

The database has been reset and reseeded (organisations and administrators only — the seed
deliberately never creates credentials, because an unsigned credential is metadata pretending to be
one). Two consequences to be aware of:

- Any credential already in a wallet on a phone will no longer verify: its session and status-list
  entry went with the reset. Reissue the three examples above once this lands, and delete the stale
  ones from the wallet.
- The portal will look empty until then. That is the honest state, not a regression.

## Acceptance criteria

- A completed bachelor's student receives one document holding the qualification and the transcript.
- A partway master's student receives a transcript listing only the semesters completed.
- A six-week certificate holder receives a qualification and no transcript block.
- No request parameter can change which of the three a student receives.
- The academy page states what will be issued rather than asking.
