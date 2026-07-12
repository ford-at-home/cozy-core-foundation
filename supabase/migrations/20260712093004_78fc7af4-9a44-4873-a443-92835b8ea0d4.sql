-- Enable pg_cron + pg_net for scheduled HTTP calls to edge functions.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove any prior schedule with this name so this migration is idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-runs-every-minute')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-runs-every-minute');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Sweep in-flight agent_runs once a minute. reconcile-runs has verify_jwt=false
-- and no RECONCILE_TOKEN is set on this project, so no auth header is required.
SELECT cron.schedule(
  'reconcile-runs-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://dlaojinagezrlbwyritd.supabase.co/functions/v1/reconcile-runs',
    headers := '{"content-type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cron$
);