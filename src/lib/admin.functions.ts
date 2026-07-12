import { createServerFn } from "@tanstack/react-start";

export const ADMIN_EMAIL = "admin@admin.local";
export const ADMIN_PASSWORD = "admin1234";

/**
 * Ensures the demo admin account exists. Idempotent.
 * NOTE: This is a demo shortcut with a hardcoded password — do not use in production.
 */
export const ensureAdminUser = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if the user already exists by listing (small demo scale).
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);
    const existing = list.users.find((u) => u.email === ADMIN_EMAIL);
    if (existing) return { ok: true };

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error && !/already/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  },
);
