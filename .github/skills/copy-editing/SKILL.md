---
name: copy-editing
description: Use when writing or reviewing text that a person reads — site pages, app strings, emails, PDFs. Removes the marks of generated prose (em dashes, semicolon-joined clauses, stacked hyphens, marketing adjectives) and restores a plain voice. Applies across the academy, the verifier, the portal, Trust University and the wallet.
---

# Copy editing

Text a person reads should sound like a person wrote it. This skill is the standard for the copy in
this repository, and it is the same standard for every site and the app: the reader should not be
able to tell which surface was written by whom, or that a machine was involved at all.

## The tells, and what to do instead

| Tell | Do this |
| --- | --- |
| **An em dash, anywhere** | Do not use one. A comma for a short aside, a colon before an explanation, a full stop when the sentence has turned. |
| **Semicolon joining two ideas** | Two sentences. A semicolon is a hedge that hides which idea matters. |
| **Stacked hyphens** in place of punctuation (`--`, `---`, ` - `) | The same treatment as an em dash. |
| **En dash in a range** (2020–2021) | Legitimate. Leave it. This is the one dash that carries information. |
| **Triads**: "fast, simple and secure" | Say the one that matters. Three adjectives is a tell that nothing specific was known. |
| **"not just X, but Y"**, "whether you are X or Y" | Assert the thing. |
| **Empty verbs**: leverage, utilise, empower, unlock, seamless, robust, comprehensive, delve | The plain verb. Use, let, remove, strong, full, look. |
| **A sentence that restates the previous one** | Delete it. |
| **Explaining the obvious**: "We use cookies to improve your experience" style filler | Either say what actually happens or say nothing. |

## Voice

- One idea per sentence. If a sentence needs a dash or a semicolon to hold it together, it is two
  sentences.
- Prefer the concrete: a number, a name, a date. "Ready in two minutes" beats "Ready quickly".
- Address the reader as *you*. Never "users".
- Say what happens, in the order it happens. Instructions are a list, not a paragraph.
- British spelling, plain words. No exclamation marks in product copy.
- A heading tells you where you are. It is not a slogan.

## Workflow

1. Run the checker to find the tells:

   ```
   node scripts/check-copy.mjs
   ```

   It reads only text a person sees: JSX text, quoted strings passed to a Text-like renderer, the
   email templates and the PDF. Comments and code identifiers are not copy and are not reported.

2. Fix what it found. The checker finds the mechanical tells; the judgement is yours — see the
   rules above, and prefer a rewrite over a substitution.

3. Run it again. It exits non-zero while anything remains, so it can gate a change.

## Judgement calls

- **A dash that is doing work.** In a credential's own name, `Academic transcript: Master of Data
  Science` reads better than a dash, but a title that a person actually wrote that way stays as it
  is. The issuer's catalogue is data, not copy.
- **Technical terms.** Never simplify a term the reader needs to act correctly (a form label, a
  legal phrase). Do simplify the ones only the machinery needs — see the plain-language pass:
  no `docType`, no `namespace`, no `offer URL` in text a holder reads.
- **No em dashes at all**, in copy or in the documents that describe this standard. The one dash
  worth keeping is the en dash in a range such as 2020–2021, where it carries meaning rather than
  the sound of a sentence turning.

## Where this applies

`issuer-frontend` (academy), `verifier-frontend` (My Jobs), `quals-portal`, 
`trust-university-frontend`, the wallet's strings in `mobile-wallet`, the email templates and the
share PDF. One standard, whichever surface it is.
