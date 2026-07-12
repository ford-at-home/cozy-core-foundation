import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Profile = {
  user_id: string;
  style_text: string;
  image_style: string;
  text_style_preset: string | null;
  image_style_preset: string | null;
  created_at: string;
  updated_at: string;
};

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ profile: Profile | null }> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(
        "user_id, style_text, image_style, text_style_preset, image_style_preset, created_at, updated_at",
      )
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: (data as Profile | null) ?? null };
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { styleText?: string; imageStyle?: string }) => data ?? {})
  .handler(async ({ data, context }): Promise<{ profile: Profile }> => {
    const styleText = typeof data.styleText === "string" ? data.styleText.trim() : "";
    const imageStyle = typeof data.imageStyle === "string" ? data.imageStyle.trim() : "";
    if (!styleText || !imageStyle) {
      throw new Error("Both Style and Image style are required.");
    }
    const { data: saved, error } = await context.supabase
      .from("profiles")
      .upsert(
        {
          user_id: context.userId,
          style_text: styleText,
          image_style: imageStyle,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("user_id, style_text, image_style, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { profile: saved as Profile };
  });
