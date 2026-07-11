import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Profile = {
  user_id: string;
  style_text: string;
  created_at: string;
  updated_at: string;
};

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ profile: Profile | null }> => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("user_id, style_text, created_at, updated_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: (data as Profile | null) ?? null };
  });

export const saveMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { styleText?: string }) => data ?? {})
  .handler(async ({ data, context }): Promise<{ profile: Profile }> => {
    const styleText = typeof data.styleText === "string" ? data.styleText : "";
    const { data: saved, error } = await context.supabase
      .from("profiles")
      .upsert(
        {
          user_id: context.userId,
          style_text: styleText,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("user_id, style_text, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return { profile: saved as Profile };
  });
