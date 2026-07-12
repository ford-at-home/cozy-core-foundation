-- Bug bash hardening (additive only; do not rewrite earlier migrations).

-- 1. Dual reconciler cron: keep reconcile-runs-every-minute, drop the older job.
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-agent-runs')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-agent-runs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2. Stop authenticated clients from writing controller state.
-- Edge functions use service_role; the UI only needs SELECT (Realtime).
DROP POLICY IF EXISTS "Users can update their own pieces" ON public.pieces;
DROP POLICY IF EXISTS "Users can update their own workflow runs" ON public.agent_runs;
REVOKE UPDATE ON TABLE public.pieces FROM authenticated;
REVOKE UPDATE, DELETE ON TABLE public.agent_runs FROM authenticated;

-- 3. One session per piece (dedupe first, then unique partial index).
WITH ranked AS (
  SELECT
    id,
    piece_id,
    ROW_NUMBER() OVER (PARTITION BY piece_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.sessions
  WHERE piece_id IS NOT NULL
),
dupes AS (
  SELECT
    r.id AS dupe_id,
    k.id AS keep_id
  FROM ranked r
  JOIN ranked k
    ON k.piece_id = r.piece_id
   AND k.rn = 1
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
  SELECT
    r.id AS dupe_id,
    k.id AS keep_id
  FROM ranked r
  JOIN ranked k
    ON k.piece_id = r.piece_id
   AND k.rn = 1
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
  SELECT
    r.id AS dupe_id,
    k.id AS keep_id
  FROM ranked r
  JOIN ranked k
    ON k.piece_id = r.piece_id
   AND k.rn = 1
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

-- 4. Ensure the private research-attachments bucket exists (policies already do).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('research-attachments', 'research-attachments', false, 20971520)
ON CONFLICT (id) DO NOTHING;
