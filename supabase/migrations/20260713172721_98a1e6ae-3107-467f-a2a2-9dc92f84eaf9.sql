-- Apply Cursor-authored marker migration supabase/migrations/20260713160000_pipeline_marker.sql
-- via the Lovable migration tool (WI-0006). No schema effect.
select 1;

-- Record the marker under its intended version so the pipeline experiment
-- can be verified deterministically in schema_migrations.
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('20260713160000', 'pipeline_marker', array['select 1;'])
on conflict (version) do nothing;