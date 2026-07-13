# Unresolved

- The research memo's comparison table leaves Concept 12 (Coolness Risk)
  without a grading tier — the row ends at the pricing column. The proposal
  therefore never assigns it one; it leans only on the memo's Hypothesis 4
  framing and the recommendation to fuse it with Concept 3. Flagged rather
  than silently repaired.
- The memo contains artifact strings from its own drafting tooling (e.g.,
  `[span_84](start_span)` inside the Subculture Agent's pricing, breaking
  the "$10,000–$40,000" figure). Preserved verbatim in
  `research/research.md`; the proposal uses the reconstructed figure
  "$10K–$40K a year" from the memo's own comparison table, which states it
  cleanly.
- The image-generation endpoint at `cozy-core-foundation.lovable.app`
  returned an HTTP 307 redirect to `hardcopy.tools`, and curl drops the
  Authorization header across hosts. Resolved by calling
  `https://hardcopy.tools/api/public/generate-image` directly; all three
  images verified as PNG. Noting in case the endpoint URL in future run
  prompts should be updated.
- No ATTACHMENTS were provided with this run; `research/attachments/` was
  not created.
