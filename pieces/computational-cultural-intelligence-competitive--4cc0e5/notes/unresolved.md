# Unresolved

- **Corrupted spans in the source research.** The research text contains artifacts — `10,00[span_84](start_span)[span_84](end_span)0\text{--}40,000` (Concept 2 pricing) and `[span_85](start_span)$50--$200 / mo SaaS` (Concept 8 pricing row) — that look like citation-anchor debris from the research tool. Preserved verbatim in `research/research.md`; the piece uses the readable interpretation ($10K–40K/yr, $50–200/mo) consistent with the comparative table.
- **Concept 12 has no tier label in the research's comparative table** (the row ends after the pricing column). The piece infers Tier 1 from its inclusion in the ranked hypotheses; recorded in `to-research.md` for confirmation.
- **Image endpoint redirect.** The documented endpoint `cozy-core-foundation.lovable.app` returns HTTP 307 to `https://hardcopy.tools/api/public/generate-image`, and following the redirect with `curl -L` drops the Authorization header (HTTP 401). Calling `hardcopy.tools` directly with the same bearer token succeeded. All three images generated and verified as PNG; no placeholders needed.
- No markup marks or dictated references were part of this run; nothing was silently dropped.
