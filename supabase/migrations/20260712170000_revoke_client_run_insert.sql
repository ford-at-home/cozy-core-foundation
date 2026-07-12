-- Post-merge reconciliation hardening (additive; do not rewrite earlier
-- migrations).
--
-- The pre-billing schema granted authenticated clients INSERT on
-- workflow_runs (now agent_runs) and pieces. The bug-bash pass revoked
-- UPDATE/DELETE only. Since the credit system landed, every run must be
-- created by an Edge Function so a credit reservation is placed before
-- dispatch — a direct client INSERT would create billable work with no
-- hold and no state-machine ownership. No client code performs these
-- inserts; this closes the door at the database.

DROP POLICY IF EXISTS "Users can insert their own workflow runs" ON public.agent_runs;
DROP POLICY IF EXISTS "Users can insert their own pieces" ON public.pieces;
REVOKE INSERT ON TABLE public.agent_runs FROM authenticated;
REVOKE INSERT ON TABLE public.pieces FROM authenticated;
