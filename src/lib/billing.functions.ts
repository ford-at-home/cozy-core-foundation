import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { extractEdgeError } from "@/lib/edge-error";

export type CheckoutInput = {
  /** Stripe Price id — validated server-side against credit_products. */
  priceId?: string;
  /** Idempotency seed so a double-click cannot open two sessions. */
  requestId?: string;
};

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CheckoutInput) => data ?? {})
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: result, error } = await context.supabase.functions.invoke(
      "create-checkout-session",
      { body: data },
    );
    if (error) throw new Error(await extractEdgeError(error, "create-checkout-session"));
    return result as { url: string };
  });
