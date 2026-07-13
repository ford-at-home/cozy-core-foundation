-- Gateway pricing seed (audit P1.6 / M3 — plan phase C4).
--
-- Re-issues the intent of the never-applied
-- 20260712110000_gateway_inference_pricing.sql (deleted in this commit) and
-- adds the two models it missed: the follow-up refinement model and the
-- dictation transcription model, both of which now record inferences.
-- Without these rows, gateway calls price at $0 with pricing_source
-- 'estimated' and real spend is invisible in the rollups.
--
-- Placeholder rates — adjust in-DB as vendor prices change (append a new
-- row with a later effective_from; never edit an old one). Fixed
-- effective_from values keep the ON CONFLICT guard genuinely idempotent
-- across replays (the original file used now(), which was not).

INSERT INTO public.model_pricing
  (provider, model, pricing_kind, per_task_price_usd, input_price_per_million, output_price_per_million, effective_from, source_url, notes)
VALUES
  (
    'lovable',
    'google/gemini-2.5-flash-image',
    'per_task',
    0.04000000, NULL, NULL,
    '2026-07-13T00:00:00Z',
    'https://ai.google.dev/pricing',
    'Placeholder per image (1024x1024) via Lovable Gateway — verify current rate'
  ),
  (
    'openai',
    'gpt-image-1',
    'per_task',
    0.04000000, NULL, NULL,
    '2026-07-13T00:00:00Z',
    'https://openai.com/api/pricing',
    'Placeholder per image fallback when Lovable Gateway unavailable'
  ),
  (
    'lovable',
    'google/gemini-2.5-flash',
    'per_token',
    NULL, 0.15000000, 0.60000000,
    '2026-07-13T00:00:00Z',
    'https://ai.google.dev/pricing',
    'Placeholder handwriting recognition + PDF OCR via Lovable Gateway (per million tokens)'
  ),
  (
    'lovable',
    'google/gemini-2.5-flash-lite',
    'per_token',
    NULL, 0.10000000, 0.40000000,
    '2026-07-13T00:00:00Z',
    'https://ai.google.dev/pricing',
    'Placeholder follow-up question refinement via Lovable Gateway (per million tokens)'
  ),
  (
    'lovable',
    'openai/gpt-4o-mini-transcribe',
    'per_token',
    NULL, 1.25000000, 5.00000000,
    '2026-07-13T00:00:00Z',
    'https://openai.com/api/pricing',
    'Placeholder dictation transcription via Lovable Gateway (audio input / text output per million tokens)'
  )
ON CONFLICT (provider, model, effective_from) DO NOTHING;
