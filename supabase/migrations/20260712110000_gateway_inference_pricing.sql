-- Seed pricing for Lovable Gateway / OpenAI calls that were previously un-metered
-- (image generation, PDF OCR). Placeholders — edit in-DB as vendor prices change.

INSERT INTO public.model_pricing
  (provider, model, pricing_kind, per_task_price_usd, input_price_per_million, output_price_per_million, effective_from, source_url, notes)
VALUES
  (
    'lovable',
    'google/gemini-2.5-flash-image',
    'per_task',
    0.04000000,
    NULL,
    NULL,
    now(),
    'https://ai.google.dev/pricing',
    'Placeholder per image (1024x1024) via Lovable Gateway — verify current rate'
  ),
  (
    'openai',
    'gpt-image-1',
    'per_task',
    0.04000000,
    NULL,
    NULL,
    now(),
    'https://openai.com/api/pricing',
    'Placeholder per image fallback when Lovable Gateway unavailable'
  ),
  (
    'lovable',
    'google/gemini-2.5-flash',
    'per_token',
    NULL,
    0.15000000,
    0.60000000,
    now(),
    'https://ai.google.dev/pricing',
    'Placeholder PDF OCR via Lovable Gateway (input/output per million tokens)'
  );
