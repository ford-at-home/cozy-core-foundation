-- Schema reconciliation (audit P0.3, P1.10, P1.11 — plan phase C4).
--
-- Ten hand-authored migrations in this directory were never applied to the
-- connected database (WI-0006 proved Cursor-authored files do not
-- auto-apply; the Lovable agent must apply them explicitly). This migration
-- re-issues the unapplied *intents* that still matter, idempotently, so one
-- explicit apply brings the live schema in line with what the repo
-- documents and tests. The stale hand-authored files are deleted in the
-- same commit; their history lives in git and docs/ARCHITECTURE.md.
--
-- Apply procedure: docs/RUNBOOK.md → "Applying Cursor-authored migrations"
-- (Lovable work item WI-0008).

-- ---------------------------------------------------------------------
-- 1. P0.3 — stop authenticated clients writing controller state.
--    (Re-issues unapplied 20260712121000_bugbash_hardening.sql §2 and
--    20260712170000_revoke_client_run_insert.sql.)
--
-- Every run must be created by an Edge Function so a credit reservation is
-- placed before dispatch, and run status/result/cost fields must only move
-- through the state machine (service role). Live DB currently still allows
-- these writes — that drift is audit finding M1/M2.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can insert their own workflow runs" ON public.agent_runs;
DROP POLICY IF EXISTS "Users can update their own workflow runs" ON public.agent_runs;
DROP POLICY IF EXISTS "Users can insert their own pieces" ON public.pieces;
DROP POLICY IF EXISTS "Users can update their own pieces" ON public.pieces;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.agent_runs FROM authenticated;
REVOKE INSERT, UPDATE ON TABLE public.pieces FROM authenticated;

-- Drop the superseded 2-minute reconciler cron if it still exists
-- (unapplied bugbash §1; harmless no-op when absent).
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-agent-runs')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-agent-runs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ---------------------------------------------------------------------
-- 2. P1.11 — one session per piece (unapplied bugbash §3).
--    Dedupe first (repoint children to the oldest session per piece),
--    then enforce with a partial unique index.
-- ---------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    piece_id,
    ROW_NUMBER() OVER (PARTITION BY piece_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sessions
  WHERE piece_id IS NOT NULL
),
dupes AS (
  SELECT r.id AS dupe_id, k.id AS keep_id
  FROM ranked r
  JOIN ranked k ON k.piece_id = r.piece_id AND k.rn = 1
  WHERE r.rn > 1
)
UPDATE public.agent_runs ar
SET session_id = d.keep_id
FROM dupes d
WHERE ar.session_id = d.dupe_id;

WITH ranked AS (
  SELECT
    id,
    piece_id,
    ROW_NUMBER() OVER (PARTITION BY piece_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sessions
  WHERE piece_id IS NOT NULL
),
dupes AS (
  SELECT r.id AS dupe_id, k.id AS keep_id
  FROM ranked r
  JOIN ranked k ON k.piece_id = r.piece_id AND k.rn = 1
  WHERE r.rn > 1
)
UPDATE public.inferences i
SET session_id = d.keep_id
FROM dupes d
WHERE i.session_id = d.dupe_id;

WITH ranked AS (
  SELECT
    id,
    piece_id,
    ROW_NUMBER() OVER (PARTITION BY piece_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sessions
  WHERE piece_id IS NOT NULL
),
dupes AS (
  SELECT r.id AS dupe_id, k.id AS keep_id
  FROM ranked r
  JOIN ranked k ON k.piece_id = r.piece_id AND k.rn = 1
  WHERE r.rn > 1
)
UPDATE public.provider_usage_events e
SET session_id = d.keep_id
FROM dupes d
WHERE e.session_id = d.dupe_id;

DELETE FROM public.sessions s
WHERE s.piece_id IS NOT NULL
  AND s.id IN (
    SELECT id
    FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY piece_id ORDER BY created_at ASC, id ASC) AS rn
      FROM public.sessions
      WHERE piece_id IS NOT NULL
    ) ranked
    WHERE ranked.rn > 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS sessions_piece_id_unique
  ON public.sessions (piece_id)
  WHERE piece_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. P1.10 — separate test spend from production spend.
--    Cost-recording code stamps context = 'test' when the acting user id
--    is listed in the TEST_ACCOUNT_IDS env/secret (set alongside the L2
--    test accounts); everything else defaults to 'production'. Code only
--    writes the column for test accounts, so it deploys safely before or
--    after this migration.
-- ---------------------------------------------------------------------
ALTER TABLE public.inferences
  ADD COLUMN IF NOT EXISTS context text NOT NULL DEFAULT 'production';
