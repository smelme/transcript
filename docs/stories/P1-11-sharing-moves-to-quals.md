# P1-11: Sharing belongs to Quals, not to the academy

**Status:** Open. Design agreed, implementation next
**Components:** a new site, `issuer-frontend/app/share/[shareId]/page.tsx` (removed),
`issuer-service/src/share-service.js`, `docs/deployment/railway.md`

## Why

A shared credential is a Quals document. It is issued by the academy, held in the Quals wallet, and
opened by whoever the holder sent it to, who has no relationship with the academy at all. Serving
that page from the academy's address tells the recipient the wrong story, and it puts the academy's
name on a surface the academy does not run.

## The shape

A separate site, Quals, holding the page a share links to. The academy keeps what belongs to it: the
student flow, the claim page, and its own pages. Nothing in the academy's navigation should lead to
sharing.

| Piece | Change |
| --- | --- |
| New site | a Next.js app, its own workspace entry, its own Railway service and address |
| Share page | moves across, and gains the courses table |
| Academy | `app/share/[shareId]` is deleted |
| Issuer | the share link is built from a new `SHARE_SITE_URL`, not from the academy's address |
| Email | the share notification links to the new address |

## The courses table

The share page prints the claims one by one, and `courses` is a JSON string, so the recipient reads
an array of objects. It becomes a table: module, title, term, credits, mark. The same shape the
registrar's page already uses, so a course row reads the same everywhere in the system.

## Worth deciding while doing it

- **The address is permanent in a different way to the others.** A share link is already in someone's
  inbox, so the address must keep working. Set it once and attach a domain rather than renaming it.
- **The new site needs its own copy of the wording rules.** The share page is read by a stranger, so
  it is the one place where the writing matters most: what this document is, who sent it, and what
  the recipient should do if they were not expecting it.
- **The wallet's share flow names an origin.** `share-service` records the origin a share was made
  from, and that origin moves with the page.

## Acceptance criteria

- A share created from the wallet emails a link on the Quals address, and that link opens a page
  that shows the shared claims, with courses as a table.
- No academy route serves a share, and no academy page links to one.
- The academy site builds and deploys without the share page.
- The deployment guide lists the new service, address and variable, and records that the address is
  permanent because share links outlive the deployment that made them.
