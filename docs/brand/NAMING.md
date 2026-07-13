# Product Naming Recommendation

Status: **provisional**. The first product ships under the restrained label
**Hardcopy Draft** until a final name is approved. Nothing in the codebase
hard-codes the product or company name outside `src/config/brand.ts`: UI copy
reads `brand`/`pageTitle()`, and the printed page's attribution footer is
injected from `brand.company.domain` by `src/lib/print-document.ts`. When
editing copy, grep for the names before claiming this still holds.

## Recommendation

### 1. Strongest: **Roundtrip**

The product's defining mechanic is that work leaves the screen and comes back
with the thread intact: prepare → print → think → mark → return. "Roundtrip"
names that loop directly, in one plain word, without borrowing paper
vocabulary the company name already owns.

- **Fit under Hardcopy Tools:** clean two-level hierarchy — "Roundtrip, a
  hardcopy tool." The company name carries the material; the product name
  carries the motion. No redundancy.
- **Communicates:** collaboration, return, refinement, process.
- **Avoids:** chatbot, enterprise-platform, PDF-utility, and note-app
  associations.
- **Risks to research before adoption:** strong travel-industry associations
  ("round-trip ticket"); existing software marks using "Roundtrip" (backup
  tools, music software, logistics products). A trademark search in software
  classes is required.

### 2. Alternative: **Longhand**

Tactile and literate; centers handwriting and human authorship. Instantly
communicates "written by hand" to any reader.

- **Fit:** "Longhand, by Hardcopy Tools" reads naturally, though it doubles
  the paper vocabulary (hardcopy + longhand) and slightly narrows the product
  to handwriting when research and reconciliation are half the loop.
- **Risks:** several existing note-taking and writing apps have used the name;
  needs conflict research.

### 3. Alternative: **Working Draft**

Plainspoken and honest. Says exactly what the user holds: a draft that is
being worked. Pairs well with the primary CTA language ("Start a working
draft").

- **Fit:** strongest immediate clarity; weakest as a distinct, protectable
  mark. Generic enough that it may never be ownable — which may be acceptable
  for a first product under a strong company brand.
- **Risks:** genericness; near-zero trademark strength.

## Why not the others evaluated

- **Hardcopy Draft / Hardcopy Writer / Hardcopy Research** — serviceable as
  descriptors (hence the provisional label) but company-name + noun makes
  every future product name feel like a SKU.
- **Return / Rework / Relay / Revision / Passage** — each names one step of
  the loop rather than the loop; "Return" collides with commerce returns.
- **Margin / Folio / Fieldnote / At Hand / Handmark** — attractive, but tip
  toward note-taking-clone territory or preciousness.
- **Stillwork / Deep Draft / Slow Draft / Second Reading / The Working Copy** —
  the reflective register moralizes slowness more than the brand should.

## Provisional usage rules

1. Use **Hardcopy Draft** wherever the product (not the company) is named:
   the landing-page product section, in-app section kickers, and per-page
   document titles. (There is no programmatic PDF filename — saving as PDF
   goes through the browser's print dialog, which names the file from the
   document title.)
2. Use **Hardcopy Tools** for the company: header wordmark, footer, auth page,
   root metadata, print attribution.
3. Never present "Hardcopy Draft" as a final name in marketing copy beyond the
   label itself (no "introducing Hardcopy Draft™").
4. All occurrences flow from `src/config/brand.ts` (`brand.product.name` and
   `pageTitle()`), so final adoption is a one-line change plus a copy review.

## Credit and billing vocabulary

The payments layer uses these terms; keep them stable across UI, docs, and
receipts (see `docs/BILLING.md` for the mechanics):

- **credit** — the unit of generation. "Each generation uses 1 credit."
  Never "token", "point", or "coin" (the header chip's coin is iconography,
  not vocabulary).
- **welcome credits** — the 3-credit signup grant (`signup_grant` ledger
  entries render as "Welcome credits").
- **generation** — the billable act (compose, deep-research start, resynth,
  ready, revise). Printing and PDF export are not generations and are free.
- **credit pack** — a one-time purchase: **Starter** (5), **Writer** (20),
  **Studio** (50). "Studio" coincides with the retired in-app kicker; whether
  to rename the pack is an open decision tracked in the README.
- Billing tone: as quiet as everything else. State the cost, link to
  `/billing`, and get out of the way.

## Before final adoption

- Trademark search (US + EU, software classes) for the chosen name.
- Domain/handle availability under or alongside hardcopy.tools
  (e.g. roundtrip.hardcopy.tools needs nothing; a standalone domain might).
- Collision review against established products in adjacent categories
  (writing tools, annotation tools, backup/travel software for "Roundtrip").
