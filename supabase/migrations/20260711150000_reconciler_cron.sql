-- Schedule the reconciler: the webhook is an optimization; this sweep is the
-- authoritative status path (plan v2 §flows). Every 2 minutes.
--
-- [Unverified] pg_cron/pg_net availability + delivery guarantees on Lovable
-- Cloud; if this migration fails to apply there, run the reconciler manually
-- or via an external scheduler until confirmed.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'reconcile-agent-runs',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dlaojinagezrlbwyritd.supabase.co/functions/v1/reconcile-runs',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
