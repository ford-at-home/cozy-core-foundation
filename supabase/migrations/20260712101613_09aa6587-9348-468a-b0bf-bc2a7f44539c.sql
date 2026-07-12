ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS text_style_preset TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS image_style_preset TEXT;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;