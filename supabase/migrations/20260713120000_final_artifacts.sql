-- Final artifacts (Phases 6–7 of the college research workflow —
-- docs/research-workflow/06-final-artifacts.md). Additive only.
--
-- After verification (and optional follow-up research), the student
-- generates a final paper (.docx) and a class presentation (.pptx). Each is
-- a separate, independently retryable agent_runs row (kind 'document' /
-- 'presentation') executed inline by the final-artifacts Edge Function:
-- 1 credit each, reserve-before-work, settle on success, release on failure.
-- Downloads and re-downloads are free.

-- 1. New run kinds.
ALTER TABLE public.agent_runs DROP CONSTRAINT IF EXISTS agent_runs_kind_check;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_kind_check
  CHECK (kind IN ('research', 'proposal', 'resynth', 'draft', 'revision', 'packet',
                  'followup_research', 'document', 'presentation'));

-- 2. Private storage bucket for the generated files. Server-written only;
--    students read their own folder (signed URLs for download).
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('final-artifacts', 'final-artifacts', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users read own final artifacts" ON storage.objects;
CREATE POLICY "Users read own final artifacts"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'final-artifacts' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. One row per generated artifact. Rows are written only by the
--    final-artifacts Edge Function (service role); clients read their own.
CREATE TABLE IF NOT EXISTS public.final_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  piece_id uuid NOT NULL REFERENCES public.pieces(id) ON DELETE CASCADE,
  packet_id uuid REFERENCES public.packets(id) ON DELETE SET NULL,
  run_id uuid NOT NULL UNIQUE REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('document', 'presentation')),
  title text,
  storage_path text NOT NULL,
  -- The parsed synthesis spec. The presentation is built FROM the paper's
  -- spec (same argument, same provenance), so it is persisted here.
  spec jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS final_artifacts_piece_id_idx ON public.final_artifacts (piece_id);
CREATE INDEX IF NOT EXISTS final_artifacts_user_id_idx ON public.final_artifacts (user_id);

REVOKE ALL ON public.final_artifacts FROM anon, authenticated;
GRANT SELECT ON public.final_artifacts TO authenticated;
GRANT ALL ON public.final_artifacts TO service_role;

ALTER TABLE public.final_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own final artifacts" ON public.final_artifacts;
CREATE POLICY "Users view own final artifacts"
  ON public.final_artifacts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
