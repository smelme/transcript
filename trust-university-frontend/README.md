# Trust University. Postgraduate admissions

A standalone relying-party site. A registrar asks the holder's wallet for their **academic
transcript** and shows only what the verifier returns.

- **Port 3007** (`npm run dev`, `npm start`)
- Proxies `/api/*` to the verifier service (`VERIFIER_API_URL`, default `http://localhost:3001`),
  so the browser and the verifier each see one origin
- `relyingPartyId: 'trust-university'`

It is its own site rather than a page inside My Jobs because the verifier binds each presentation
to the asking page's **origin**: `http://localhost:3007` here, `http://localhost:3003` for My Jobs.
Two relying parties with different questions and different claim sets should not share an origin,
a nav or a stylesheet.

## What it asks for

No `docType` identifies a transcript: every credential kind is issued as a photo-ID document. The
**transcript namespace** in the request is what limits it to a transcript credential. The award
namespace is deliberately *not* requested. A transcript credential does not carry it, and asking
would suggest a registrar reads an award from a transcript.

The recognition details (institution identifiers, the recognised programme title, the language of
instruction, per-module workload and grouping, and the attesting office) are requested too, because
they are what let the university identify the institution and the module rather than read a name.
A credential issued without them simply discloses nothing for those fields, and the panel that
shows them is not rendered.

## Running it

```bash
# verifier service on 3001, then:
cd trust-university-frontend && npm install && npm run dev   # http://localhost:3007
```

Presenting needs a browser with the Web Credentials API (`navigator.credentials.get`) and the wallet
app installed on a phone. When the browser cannot ask for a credential the page says so plainly
instead of failing silently, and cancelling in the wallet is reported as a cancellation rather than
an error.
