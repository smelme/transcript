# Share document, UI implementation

**Story:** P1-13. **Date:** 2026-09-20. **Applies to:** `quals-frontend` share page, and the PDF the
recipient downloads from the issuer.

## The rule this follows

The page and the PDF are two renderings of **one document object**, built on the issuer by
`issuer-service/src/share-document.js` and returned by `POST /shares/:id/view` as `document`. The
page draws it, the PDF lays it out, and neither decides what belongs in it. Adding a field, renaming
a heading or reordering a section is a change in one file.

## Structure

| Class | Purpose |
| --- | --- |
| `.doc` | the document surface: white, a hairline border, generous padding, 780px wide |
| `.doc-head` | masthead: mark, product name, credential kind and share date, closed by a 2px rule |
| `.doc h1`, `.doc-subtitle`, `.doc-lede` | what the document is, whose it is, and where the values came from |
| `.doc-section` + `h2` | a section: uppercase muted heading over a hairline rule |
| `.doc dl` | label and value rows, 148px label column, one column under 560px |
| `.doc table` | the module table, inside the site's `.table-scroll` box |
| `.doc-message` | the sender's message, in a gold-ruled box |
| `.doc-checks` | what was verified, as a short list |
| `.doc-foot` | provenance |
| `.doc-actions` | the download button, deliberately outside the document |

## Behaviour notes

- The download button sits outside `.doc` and is hidden in print, so a printed page carries no
  button and no masthead clutter beyond the document itself.
- The module table scrolls inside its box rather than widening the page. Verified: at 360px the box
  scrolls, at 1024px it does not, and the page itself never scrolls sideways at either width.
- A module code never wraps: it is an identifier, and half of one reads as two modules.
- The page falls back to listing the disclosed claims plainly if the issuer returns no `document`,
  which is what an older issuer would do.
- The mark is `public/quals-mark.svg`: the same gold and green square with a Q that the management
  portal uses, so one product has one mark. The PDF draws the same mark from shapes, because a PDF
  writer that must embed an image is a heavier thing than a document needs.

## Accessibility

- The mark is decorative and carries `alt=""`; the product name beside it is real text.
- Sections are headings, label and value are `dt`/`dd`, the module list is a real table with `scope`
  on its column headers, and the checks are a list.
- Nothing is conveyed by colour alone; the gold rule on the message is decoration over a plain
  bordered box.

## Test scenarios

1. Sign in, accept terms, read the document: six sections in order, module table populated.
2. Download the PDF: same title, same headings, module table continuing across pages with its
   heading row repeated, and a footer naming the share and the page count.
3. Phone: the module table scrolls in its box, the label column collapses above its value, and the
   page does not scroll sideways.
4. Print the page: the document prints, the download button and site chrome do not.
