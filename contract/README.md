# contract/ — the synthesize contract (vendored)

Copied from the `i-write-too-much` repo (packages `markdown-soul` and `paper-markup`)
on 2026-07-11. That repo is no longer a dependency of this product; this directory is
now the authoritative copy the cloud agent reads when it runs.

| File | Role |
|---|---|
| `SKILL.md` | The synthesize contract: modes, workflow, output shapes, refusal rules. |
| `references/BRIEF.template.md` | The five-field brief the agent authors before synthesizing. |
| `references/STORYTELLING.md` | Piece architecture reference. |
| `references/MARKUP.md` | Pen-and-paper markup vocabulary (symbols, `S{n}P{m}` block anchors, directives). Drives the annotation/revision flow. |
| `references/*.template.md` | Persona / style / anti-slop / channel shapes referenced by SKILL.md. |
| `bundles/*.BUNDLE.md` | The two bundles this product uses: `personal` (edit/synthesis) and `voice-only` (polish). |

## Adaptations for this system (read before prompting an agent)

The contract was written for a CLI plugin with file-based state. Three of its rules are
**overridden by the agent prompt** in this product:

1. **Voice resolution.** SKILL.md resolves voice from `~/.me/voices/<name>.md` and refuses
   if missing. Here, voice is the signed-in user's profile `style_text`, injected **inline
   into the agent prompt**. The prompt states this override explicitly; the refusal rule
   still applies if the inline voice text is empty.
2. **Channel resolution.** Same: channel constraints are supplied inline (or defaulted to
   `longform`), not read from `~/.me/channels/`.
3. **Output location.** Outputs are written to the piece's directory in this repo
   (see `docs/cloud-agents-architecture-plan.md` §"Repo layout"), not to a `.output/` tree
   in a separate work repo.

Everything else — brief-first discipline, throughline test, markup resolution order,
"never silently skip", auxiliary outputs (`to-research`, `tighten`, `unresolved`) — applies
unchanged.

The `S{n}P{m}` block-anchor counting rule in `references/MARKUP.md` must stay in sync with
`src/styles/print.css` (the app's print view). If you change one, change both — `npm test`
(the anchor and print-fidelity suites) pins them to each other.

## Not vendored

The source repo shipped sibling packages that this product does not use, and
`SKILL.md` still mentions them:

- **`ksp`** (`references/KSP.md`, the `ksp-compress` bundle, the `ksp-score` skill)
- **`comm-plan`**

None of these files exist here. Per SKILL.md's own rule, a bundle whose reference
is missing must stop rather than improvise — so if the **KSP directive** appears in
markup, record it in `notes/unresolved.md` instead of restructuring from memory.
The only bundles available in this repo are `personal` and `voice-only`.

## Where this sits in the product

This contract governs **what the cloud agent writes**, not when it runs. Billing
happens upstream: the control plane reserves credits before dispatching a run and
settles or releases them on completion (see `docs/BILLING.md`). Nothing in this
directory should check, grant, or consume credits.
