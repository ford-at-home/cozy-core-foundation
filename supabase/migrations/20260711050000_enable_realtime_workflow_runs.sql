-- Enable Supabase Realtime for workflow_runs so the run-detail page can
-- subscribe to status/result updates as the worker processes a run.
-- Additive: does not modify the foundation table or its RLS policies.
do $$
begin
  alter publication supabase_realtime add table public.workflow_runs;
exception
  when duplicate_object then null;
end $$;
