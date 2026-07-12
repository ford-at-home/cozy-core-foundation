import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Credits held per generation — mirror of supabase/functions/_shared/credits.ts. */
export const CREDIT_COST = {
  compose: 1,
  research: 2,
  resynth: 1,
  ready: 1,
  revise: 1,
} as const;

/**
 * The caller's credit balance, read from the RLS-protected projection and
 * kept live via realtime. The server is the only writer — this is display
 * state, never an input to any billable decision.
 */
export function useCreditBalance() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["credits", "balance"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return null;
      const { data, error } = await supabase
        .from("credit_accounts")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data?.balance ?? 0;
    },
    staleTime: 15_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("credit-balance")
      .on("postgres_changes", { event: "*", schema: "public", table: "credit_accounts" }, () =>
        queryClient.invalidateQueries({ queryKey: ["credits", "balance"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return { balance: query.data ?? null, isLoading: query.isLoading, refetch: query.refetch };
}

/** True when an edge-function error message carries the paywall code. */
export function isInsufficientCreditsError(message: string): boolean {
  return message.includes("insufficient_credits") || message.includes("Not enough credits");
}
