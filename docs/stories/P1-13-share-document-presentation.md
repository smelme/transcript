# P1-13: A shared credential reads as a document

**Status:** Built, verified at desktop and phone widths, deployed
**Components:** `issuer-service/src/share-document.js` (new), `issuer-service/src/pdf.js`,
`issuer-service/src/share-service.js`, `quals-frontend/app/share/[shareId]/page.tsx`,
`quals-frontend/app/share/share.css` (new)

## The problem

A share was readable but not presentable. The page was one flat table of claim names and values,
with the module list as a second table below it and nothing saying what the document was. The PDF
was worse: a single page of `label: value` lines, in which the course array was printed as JSON,
and which silently ran off the bottom of the page once a transcript had more than about forty
modules.

Neither said what a reader needs to know first: whose document this is, what it is, and what was
checked before it was shown.

## What it looks like now

Both surfaces draw the same document:

| Part | Content |
| --- | --- |
| Masthead | the Quals mark, the product name, the kind of credential, and when it was shared |
| Title | the credential kind, with the programme and institution beneath it |
| Lede | where the values came from, and that only released fields are shown |
| Holder | name, date of birth, student ID |
| Qualification | institution, programme, level, field, dates, outcome, grade |
| Transcript | document type, credits, status, who attested it |
| Modules | a table of module, title, term, credits and mark, with workload and requirement only where a module carries them |
| About this share | who shared it, with whom, until when, which sections were released, and the reference |
| What Quals checked | what actually happened, in three lines |
| Provenance | that Quals keeps no copy |

The PDF carries a footer on every page with the product name, the share reference and `Page n of m`,
and it repeats the module table's heading row wherever the table continues onto a new page.

## The decision that matters

**One document, built once, on the issuer.** `buildShareDocument()` turns a stored share into
sections, and both the page and the PDF render that object. The alternative, a layout decision in
the React page and another in the PDF writer, is two answers to the same question that drift the
first time someone changes one of them.

It also settles a smaller question permanently. A credential's claims arrive with camelCase names
for a transcript and snake_case names for a qualification, so `canonicalKey()` folds them together
and both spellings land under the same heading.

**Nothing disclosed is dropped.** A claim with no heading of its own goes under "Other disclosed
details". A recipient is entitled to see exactly what the holder released, and a field quietly
missing is worse than an odd heading.

**Only what happened is claimed.** "What Quals checked" says the institution's signature was
checked and that the credential's revocation status was read at that moment, because both are true
of the share flow. Neither survives into the document, so neither is presented as though it did.

## The PDF writer

Still dependency-free, and now a small layout engine: WinAnsi text in Helvetica and Helvetica-Bold,
a masthead drawn from shapes rather than an embedded image, sections, a wrapping table with a
repeating header, and pagination that keeps a heading with its first row.

Two limits are deliberate and documented in the file. Text is written as WinAnsi, so a character
outside it becomes `?` rather than an unreadable byte pair; and line breaks come from an approximate
Helvetica width with a margin, because a line that lands a little short is invisible and a line that
overflows is not.

## Verification

- `issuer-service/tests/share-document.test.js`, 10 tests: both spellings land in one place, no
  claim is shown twice and none is left out, dates render one way, a JSON string claim becomes a
  table, optional columns appear only when carried, a 60 module transcript becomes more than one
  page with every page footed, parentheses are escaped, and a character outside WinAnsi becomes one
  question mark. The issuer suite is 93 tests, all passing.
- The page was rendered against a real document from `buildShareDocument`, with the share API
  answered from that object: the six section headings appear in order, twenty labelled rows, eight
  module rows, no sideways scroll of the page at 1024px or 360px, and the module table scrolling in
  its own box on a phone, which is what it is for.
- A 42 module transcript produced a six page PDF containing the title, the section headings, the
  checked list and the footer.

## Not covered

- A share made before this change keeps working: the page falls back to listing the disclosed
  claims plainly if the issuer returns no document.
- The wallet's own screens, which are native and unchanged.
- Whether the institution's mark should appear beside the Quals mark on a qualification. The
  credential is issued by the institution and read on a Quals surface, and only the Quals mark is
  drawn today.
