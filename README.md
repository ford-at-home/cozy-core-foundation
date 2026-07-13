# Hardcopy Draft — by Hardcopy Tools

A research and drafting collaborator built to move between AI, paper,
handwriting, and voice: research with AI, print a wide-margin US Letter
working draft, mark it up by hand, and return the annotations to produce the
next version. (Names come from `src/config/brand.ts`; "Compose" survives only
as the repo's internal codename.)

## Stack

TanStack Start (React 19, file-based routes) + Supabase (Postgres, Auth,
Edge Functions) on Lovable Cloud, with Cursor/Parallel cloud agents doing the
writing, Stripe-billed credits gating generation, and a browser paged-media
pipeline producing the printable artifact.

## Documentation (one authoritative doc per topic)

| Topic                                    | Document                                                     |
| ---------------------------------------- | ------------------------------------------------------------ |
| Architecture (verified map)              | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                  |
| Billing, credits, Stripe                 | [docs/BILLING.md](docs/BILLING.md)                            |
| Configuration & environment variables    | [docs/CONFIGURATION.md](docs/CONFIGURATION.md)                |
| Operations & one-time setup              | [docs/RUNBOOK.md](docs/RUNBOOK.md)                            |
| Brand voice, naming, copy                | [docs/brand/](docs/brand/)                                    |
| Agent rules & skill router               | [AGENTS.md](AGENTS.md) + [.cursor/skills/](.cursor/skills/)   |
| Post-merge reconciliation audit (2026-07) | [docs/RECONCILIATION.md](docs/RECONCILIATION.md)              |

## Development

```sh
npm install
npm run dev        # local dev server
npm run check      # lint + typecheck + vitest + build
npm run test:functions   # Deno edge-function tests
```

The print-fidelity suite needs Chromium once per environment:
`npx playwright install chromium`. The full validation gate CI runs is in
[.github/workflows/ci.yml](.github/workflows/ci.yml).

This repository is connected to [Lovable](https://lovable.dev); commits on
`main` sync to the Lovable editor — keep the branch in a working state and
never rewrite published history.
