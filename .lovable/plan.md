## Foundation Setup Plan (revised)

Minimal, buildable foundation. No product features invented. Generation runs on an external self-hosted Node worker — this project only queues runs and calls the worker over HTTPS from an Edge Function.

### 1. Lovable Cloud
Enable to provision database, auth, and edge functions.

### 2. Database migration — `public.workflow_runs`
Columns exactly as specified:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `status text not null default 'queued'` with CHECK in (`queued`,`running`,`succeeded`,`failed`,`canceled`)
- `workflow_type text not null default 'compose'`
- `input jsonb`
- `result jsonb`
- `error text`
- `created_at timestamptz not null default now()`
- `started_at timestamptz`
- `completed_at timestamptz`

Grants: `authenticated` (SELECT/INSERT/UPDATE/DELETE), `service_role` (ALL). No `anon`.

RLS enabled. Three policies scoped to `auth.uid() = user_id`: select-own, insert-own (with WITH CHECK), update-own. No delete policy (not requested).

Index on `(user_id, created_at desc)`.

### 3. Authentication
Email/password only via Lovable Cloud. No profiles table (not requested).
- `src/routes/auth.tsx` — public sign in / sign up page.
- Filtered `onAuthStateChange` listener in `__root.tsx` (SIGNED_IN / SIGNED_OUT / USER_UPDATED only) that invalidates router and, on sign-in, queries.

### 4. Protected layout
Integration-managed `src/routes/_authenticated/route.tsx` (`ssr: false`, redirect to `/auth`). Bearer `functionMiddleware` appended in `src/start.ts` via generated `attachSupabaseAuth`.

Minimal shell inside the layout:
- Top bar: app name, current user email, Sign out button
- Nav: Dashboard, New piece
- `<Outlet />` for children

### 5. Pages
- `src/routes/index.tsx` — replace placeholder with tiny landing linking to `/auth` (signed out) or `/dashboard` (signed in).
- `src/routes/_authenticated/dashboard.tsx` — server function `listMyRuns` (uses `requireSupabaseAuth`) returns the 20 most recent `workflow_runs` for the user; renders a plain table (created_at, workflow_type, status). Empty state + INSERT marker for migrated dashboard UI.
- `src/routes/_authenticated/new.tsx` — placeholder form stub with disabled textarea/select and a "Start" button wired to a `startWorkflow` server function that invokes the `start-workflow` edge function. INSERT marker for the migrated editor UI. No real editor built.

### 6. Server function bridge
`src/lib/workflows.functions.ts`:
- `listMyRuns` — `.middleware([requireSupabaseAuth])`, reads via RLS.
- `startWorkflow` — `.middleware([requireSupabaseAuth])`, invokes edge function `start-workflow` via `context.supabase.functions.invoke(...)` and returns `{ runId }`.

### 7. Edge Function `supabase/functions/start-workflow/index.ts`
- Verifies caller JWT (reads Authorization header, uses anon client to `auth.getUser()`).
- Zod-validates body `{ research, voice, goal, bundle, model }` (all optional strings/objects — kept permissive since the real editor isn't built yet).
- Inserts a `workflow_runs` row with `status='queued'`, `workflow_type='compose'`, `input={...}`, `user_id=<auth uid>` using service role client.
- Reads `Deno.env.get('WORKER_URL')` and `WORKER_TOKEN`. If `WORKER_URL` is set, POSTs `{ runId, input }` to `${WORKER_URL}/compose` with `Authorization: Bearer ${WORKER_TOKEN}`. Fire-and-forget with try/catch; on network failure, updates row `status='failed'`, `error=...` and still returns 200 with runId. If `WORKER_URL` not set, skip the call and return `{ runId }`.
- No AI SDK import. No AI provider key. CORS headers set.

`supabase/config.toml` entry: `[functions.start-workflow] verify_jwt = true`.

### 8. Secrets
`WORKER_URL` and `WORKER_TOKEN` stored via secrets tools (server-side only). Not referenced anywhere in `src/`, not exposed as `VITE_*`. Will be requested from the user via `add_secret` after they confirm intent to wire the real worker; foundation build does not require them to be present (edge function tolerates missing).

### 9. Centralized frontend config
`src/config/backend.ts` exposes only browser-safe values (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` from `import.meta.env.VITE_*`) plus the edge function name constant `EDGE_FUNCTIONS.startWorkflow = 'start-workflow'`. No worker URLs here.

### 10. Head metadata
Update `__root.tsx` title/description to neutral names ("Compose") with matching og/twitter. No og:image at root.

---

### Files created / modified

```
src/
  config/
    backend.ts                          NEW
  lib/
    workflows.functions.ts              NEW — listMyRuns, startWorkflow
  routes/
    __root.tsx                          MOD — title, auth listener
    index.tsx                           MOD — landing
    auth.tsx                            NEW — email/password
    _authenticated/
      route.tsx                         NEW — managed gate + shell
      dashboard.tsx                     NEW — recent runs list
      new.tsx                           NEW — form stub
  start.ts                              MOD — append attachSupabaseAuth
supabase/
  config.toml                           MOD — start-workflow entry
  functions/
    start-workflow/
      index.ts                          NEW
  migrations/
    <ts>_workflow_runs.sql              NEW
```

### Cloud resources created
- **Auth**: email/password enabled.
- **Table**: `public.workflow_runs` with grants, RLS, three owner-scoped policies (select/insert/update), index on `(user_id, created_at desc)`.
- **Edge Function**: `start-workflow` (verify_jwt=true).
- **Secrets (server-side only, requested from user separately)**: `WORKER_URL`, `WORKER_TOKEN`.

### Files to PRESERVE during migration
Do not overwrite when importing the existing app:
- `src/integrations/supabase/*` (generated client + types)
- `src/routes/__root.tsx` (merge only; keep auth listener + shell)
- `src/routes/_authenticated/route.tsx` (managed gate)
- `src/routes/auth.tsx`
- `src/start.ts` (bearer middleware)
- `src/config/backend.ts`
- `src/lib/workflows.functions.ts`
- `supabase/migrations/*`
- `supabase/config.toml`
- `supabase/functions/start-workflow/index.ts` (extend, don't replace)
- `package.json`, `bun.lock`, `vite.config.ts`, `tsconfig.json`, `src/styles.css`, `src/router.tsx`, `src/server.ts`, `src/routeTree.gen.ts` (auto-generated)

### Where to insert migrated app code
- **UI components** → new `src/components/` (create during migration).
- **Editor / "New piece" form** → replace body of `src/routes/_authenticated/new.tsx` at the `{/* INSERT: composer UI */}` marker. Keep the existing `startWorkflow` call from `@/lib/workflows.functions` — do not call the edge function directly from the browser.
- **Dashboard UI (cards, filters, run detail)** → replace body of `src/routes/_authenticated/dashboard.tsx` at `{/* INSERT: dashboard UI */}`; keep using `listMyRuns`.
- **Run detail page** → new file `src/routes/_authenticated/runs.$id.tsx` (add during migration); read via a new server function in `workflows.functions.ts` scoped by RLS.
- **Client hooks / stores / utilities** → `src/hooks/`, `src/lib/` (new files; do not overwrite `workflows.functions.ts`).
- **Additional protected pages** → new files under `src/routes/_authenticated/`.
- **Additional public pages** → new files at the top level of `src/routes/`.
- **Data-access layer** → add server functions to `src/lib/*.functions.ts` using `createServerFn().middleware([requireSupabaseAuth])`; never query Supabase with the browser client for write paths.
- **Worker dispatch logic tweaks (payload shape, retry, signature)** → inside `supabase/functions/start-workflow/index.ts`, at the marked TODO. Keep JWT verification and RLS-safe insert.
- **New tables / columns** → new files in `supabase/migrations/`. Never edit existing migrations.
- **New backend URLs / non-secret config** → extend `src/config/backend.ts`. Secrets stay in edge function env only.
