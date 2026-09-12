# Transcript Credential Architecture

## Requirements

A holder must be able to obtain a qualification credential, a transcript credential, or
both; a registrar must be able to request transcript information specifically; a Smart
Academy administrator must be able to see and manage what it issued; and a holder must
be able to share a transcript by email through the existing share and verification
path. Existing credentials in wallets and the My Jobs relying party must keep working
unchanged, and revocation must stay per credential.

## Options considered

| Option | Benefits | Risks | Decision |
|---|---|---|---|
| Keep one credential with all namespaces; choose only at presentation | No issuer change | Wallet cannot tell a qualification from a transcript; a registrar must request the identity credential and receive qualification claims with it; one status applies to everything | Rejected |
| One docType for both kinds - `org.iso.23220.photoid.1`, carrying the personal components - with the academic claims in their own namespace: `org.iso.23220.education.qualification.1` or `org.iso.23220.education.transcript.1` | The transcript keeps the personal components a registrar needs; the academic claims are separated per kind; existing credentials and the My Jobs request are untouched; a relying party selects by namespace, which is what the protocol is for | docType no longer identifies the kind, so the wallet, the portal and the credential offer must label by namespace | **Selected** |
| A distinct docType per kind (`org.iso.23220.education.transcript.1` for the transcript) | The kind is visible in the docType | Splits the document type away from the personal components it shares with a qualification; an unfamiliar docType to wallets and relying parties | Rejected |

## Selected design

```mermaid
flowchart TD
  Student[Student] -->|requests qualification, transcript or both| Academy[Smart Academy app]
  Academy -->|POST /academy/requests include=...| Issuer[Issuer service]
  Issuer -->|one issuance session per kind, own status index| Sessions[Issuance sessions]
  Sessions -->|claim with device key| Wallet[Android wallet]
  Wallet --> Qual[Qualification credential<br/>photo-ID docType<br/>qualification namespace]
  Wallet --> Transcript[Transcript credential<br/>photo-ID docType<br/>transcript namespace]

  Registrar[Trust University RP] -->|POST /presentation/sessions<br/>docType education.transcript.1| Verifier[Verifier service]
  Verifier -->|org-iso-mdoc request| Wallet
  Wallet -->|transcript namespace only| Verifier
  Verifier -->|verified claims + status from the signed MSO| Registrar

  Wallet -->|share transcript by email| Share[Share flow]
  Share --> Verifier
  Recipient[Email recipient] --> Share
```

### Credential kinds

Both kinds are issued as a photo-ID document (`org.iso.23220.photoid.1`) carrying the
holder's personal components; the academic namespace decides the kind.

| Kind | docType | Namespaces held | Used by |
|---|---|---|---|
| Qualification | `org.iso.23220.photoid.1` | `org.iso.23220.photoid.1` (personal), `org.iso.23220.education.qualification.1` | My Jobs, existing credentials |
| Transcript | `org.iso.23220.photoid.1` | `org.iso.23220.photoid.1` (personal), `org.iso.23220.education.transcript.1` (grades) | Trust University, sharing |

Selection is by namespace, not by docType: a registrar asking for the photo-ID docType with
the transcript namespace can only be satisfied by the transcript credential. Because the
docType is shared, the kind is reported explicitly (`kind`, `label`,
`academicNamespaces`) so the wallet, the portal and the academy app label a credential from
what it holds rather than guessing. A credential holding both academic namespaces - the
combined credential issued before the choice existed - is reported as `academic`.

Identity travels with both kinds so a registrar can bind a transcript to a person. The
holder still discloses namespace by namespace, so sharing a transcript can withhold
identity fields exactly as sharing a qualification does today.

### Service boundary

- **Issuer service** owns the kind definitions, per-kind namespace assembly, the
  issuance choice, the status index and the registry row. It never issues a namespace
  that does not belong to the requested kind.
- **Smart Academy app** presents the choice and claims each resulting credential.
- **Management portal** shows the kind per credential and scopes everything to the
  organisation, as it already does for one kind.
- **Verifier service** is unchanged in behaviour: it is told the docType and namespaces
  by the relying party, resolves status from the credential's signed MSO, and returns
  the disclosed claims.
- **Wallet** stores and labels each credential by kind and shares one kind at a time.

## Claim sets: what is compatible with what

The EU (ELMO/EuroLMAI) and US (PESC/CEDS) transcript models are not rival formats to choose
between. They describe largely the same study, and their differences fall into three groups, only
the third of which needs structural separation.

| Kind of difference | Examples | How to carry it |
|---|---|---|
| **Same concept, different vocabulary or scale** | credits (ECTS vs US credit hours), marks (10-point scale vs 4.00 GPA vs letter), level (EQF vs class standing), programme classification (ISCED-F vs CIP), institution identifier (SCHAC/Erasmus vs a national institution code), academic period (free-text term vs coded session) | One element, **scheme-qualified**: a value never travels without the scheme it belongs to (`gradingSchemeLocalId`/`identifier type=…` in ELMO, one element per coding system in PESC). This is how both standards solve it internally |
| **Concept that exists on only one side** | *US:* attempted vs earned credits, grade point average with quality points, several summaries, credit basis and override school, official/partial document status, release authorisation, destination and tracking. *EU:* ECTS grade, EQF level, language of instruction, diploma supplement | Additive elements. Nothing conflicts; a reader ignores what it does not understand |
| **Genuinely conflicting or jurisdiction-legal** | credit arithmetic (ECTS and credit hours must never be summed or silently converted), consent framing (a FERPA release is not a GDPR purpose limitation), identifiers we should not model at all (national insurance/SSN, ethnicity, residency) | A separate namespace, or not modelled |

### Namespace strategy

1. **The transcript namespace carries the shared core**, model-neutral and scheme-qualified:
   institution with a typed identifier, programme with a coded classification (scheme named),
   results with the scale beside every mark, credits with their scheme, the academic period, the
   outcome, and the aggregates.
2. **One additional namespace carries the administrative-record extras** that a US-style reader
   asks for: attempted versus earned credits, averages with their range and quality points,
   summary types, credit basis and override school, official or partial status, release
   authorisation, destination and tracking reference.
3. **A third namespace, only if it is ever needed, carries EU recognition extras**: ECTS grade,
   EQF level, language of instruction, diploma supplement reference.
4. **A total is always per scheme.** This one rule is what prevents the dangerous failure mode:
   a US registrar reading ECTS as credit hours, or someone quietly converting 27 ECTS into credit
   hours and averaging them together.

A namespace groups claims that are requested together; it does not make a credential compatible.
Compatibility comes from values that state their scheme. The reasons to separate at all are to let
a relying party ask for one audience's view without the other's, and to keep jurisdiction-legal
elements off the surface every presentation exposes.

Naming should follow content rather than audience: the administrative-record namespace will be
named for what it holds, not for the country whose practice it came from, because practice changes
and content does not.

## API contract direction

- `POST /academy/requests` gains `include`: `qualification` (default), `transcript`, or
  `both`. One issuance session is created per requested kind; the response and the email
  list them.
- `GET /academy/credentials` entries gain `kind` and `docType`.
- `credentialData.docType` decides what `POST /credentials/issue`,
  `POST /issuance-sessions` and the claim path build; `docType` is no longer hard-coded.
- `POST /shares` uses the credential's own docType when it creates the verifier session,
  and refuses a category the credential does not hold.
- Relying parties pass `docType` and `nameSpaces` per session; Trust University asks for
  the photo-ID docType with the transcript namespace, plus the name elements a registrar
  needs. My Jobs keeps asking for the qualification namespace.
- One limitation to note: the OpenID4VCI credential offer names the docType, so both kinds
  look alike in an offer. The offer's pre-authorized code is the session, which is what
  carries the kind; the academy app is told it separately.

## Failure behavior and rollback

Unknown or missing `include` falls back to today's behaviour (qualification only).
A credential is never issued with namespaces from another kind. If a kind must be
withdrawn, stop offering it in the academy app and the portal; existing credentials keep
verifying and their status entries stay valid. Rolling back is reverting to one kind per
request, which leaves already-issued transcript credentials verifiable but unclaimable.

## Operational concerns

Each kind adds one registry row and one status index per issuance, so the status list
grows twice as fast when both are chosen; gaps are already harmless. The transcript
namespace carries a JSON `courses` string, so claim payloads are larger than a
qualification's — the portal and RP must not assume qualification-sized claims. No new
personal data is collected: the transcript is generated from the same academic record as
today.
