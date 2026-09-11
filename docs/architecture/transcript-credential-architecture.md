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
| Separate docType per kind: `org.iso.23220.photoid.1` (identity + qualification) and `org.iso.23220.education.transcript.1` (identity + transcript) | Additive, no change to existing credentials or My Jobs; each kind has its own status index, registry row and revocation; the wallet and portal can label by docType; the RP asks for exactly what it needs | Two credentials per student when both are chosen; two sessions to claim | **Selected** |
| Move qualification out of `photoid.1` into its own docType | Symmetric kinds | Breaks every qualification credential already in a wallet and the My Jobs request | Rejected |

## Selected design

```mermaid
flowchart TD
  Student[Student] -->|requests qualification, transcript or both| Academy[Smart Academy app]
  Academy -->|POST /academy/requests include=...| Issuer[Issuer service]
  Issuer -->|one issuance session per kind, own status index| Sessions[Issuance sessions]
  Sessions -->|claim with device key| Wallet[Android wallet]
  Wallet --> Qual[Qualification credential<br/>docType photoid.1]
  Wallet --> Transcript[Transcript credential<br/>docType education.transcript.1]

  Registrar[Trust University RP] -->|POST /presentation/sessions<br/>docType education.transcript.1| Verifier[Verifier service]
  Verifier -->|org-iso-mdoc request| Wallet
  Wallet -->|transcript namespace only| Verifier
  Verifier -->|verified claims + status from the signed MSO| Registrar

  Wallet -->|share transcript by email| Share[Share flow]
  Share --> Verifier
  Recipient[Email recipient] --> Share
```

### Credential kinds

| Kind | docType | Namespaces | Used by |
|---|---|---|---|
| Qualification | `org.iso.23220.photoid.1` | `org.iso.23220.photoid.1`, `org.iso.23220.education.qualification.1` | My Jobs, existing credentials |
| Transcript | `org.iso.23220.education.transcript.1` | `org.iso.23220.photoid.1`, `org.iso.23220.education.transcript.1` | Trust University, sharing |

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

## API contract direction

- `POST /academy/requests` gains `include`: `qualification` (default), `transcript`, or
  `both`. One issuance session is created per requested kind; the response and the email
  list them.
- `GET /academy/credentials` entries gain `kind` and `docType`.
- `credentialData.docType` decides what `POST /credentials/issue`,
  `POST /issuance-sessions` and the claim path build; `docType` is no longer hard-coded.
- `POST /shares` uses the credential's own docType when it creates the verifier session.
- Relying parties pass `docType` and `nameSpaces` per session; Trust University asks for
  the transcript docType and, for registration, the transcript namespace plus the name.

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
