import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createCheckout } from "@/lib/billing.functions";
import { useCreditBalance } from "@/lib/use-credits";
import { Skeleton } from "@/components/ui/skeleton";
import { brand, pageTitle } from "@/config/brand";

// Billing: balance, credit packs (Stripe-hosted Checkout), purchase history,
// and the credit ledger. The success/canceled banners are UX only — credits
// appear when the verified Stripe webhook lands, never from the redirect.
export const Route = createFileRoute("/_authenticated/billing")({
  validateSearch: (search: Record<string, unknown>): { status?: "success" | "canceled" } =>
    search.status === "success" || search.status === "canceled" ? { status: search.status } : {},
  head: () => ({
    meta: [
      { title: pageTitle("Billing") },
      { name: "description", content: "Credits and billing." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

type Product = {
  stripe_price_id: string;
  name: string;
  credits: number;
  amount_cents: number;
  currency: string;
};

type Purchase = {
  id: string;
  credits: number;
  amount_total_cents: number | null;
  currency: string | null;
  status: string;
  created_at: string;
};

type LedgerEntry = {
  id: string;
  amount: number;
  entry_type: string;
  reason: string | null;
  created_at: string;
};

const ENTRY_LABELS: Record<string, string> = {
  signup_grant: "Welcome credits",
  purchase: "Purchase",
  promo_grant: "Promotion",
  subscription_grant: "Subscription",
  consumption: "Generation",
  refund_reversal: "Refund",
  chargeback_reversal: "Chargeback",
  expiration: "Expired",
  admin_adjustment: "Adjustment",
};

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function BillingPage() {
  const { status } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const checkout = useServerFn(createCheckout);
  const { balance, isLoading: balanceLoading } = useCreditBalance();
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // requestId seeds the Stripe idempotency key: one session per page visit
  // even if Buy is clicked twice.
  const requestId = useMemo(() => crypto.randomUUID(), []);

  // Returning from checkout: the webhook may land seconds after the
  // redirect. The realtime subscription updates the balance; nudge the
  // purchase list too.
  useEffect(() => {
    if (status !== "success") return;
    const t = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      queryClient.invalidateQueries({ queryKey: ["credits", "balance"] });
    }, 3000);
    const stop = setTimeout(() => clearInterval(t), 30_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [status, queryClient]);

  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ["billing", "products"],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("credit_products")
        .select("stripe_price_id, name, credits, amount_cents, currency")
        .eq("active", true)
        .order("sort");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["billing", "purchases"],
    queryFn: async (): Promise<Purchase[]> => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, credits, amount_total_cents, currency, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["billing", "ledger"],
    queryFn: async (): Promise<LedgerEntry[]> => {
      const { data, error } = await supabase
        .from("credit_ledger")
        .select("id, amount, entry_type, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  async function handleBuy(priceId: string) {
    if (buying) return;
    setBuying(priceId);
    setError(null);
    try {
      const { url } = await checkout({ data: { priceId, requestId } });
      window.location.href = url; // Stripe-hosted Checkout
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBuying(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {brand.product.name}
        </p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Billing</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Each generation uses 1 credit; a deep-research start uses 2. Credits are only consumed
          when a generation finishes — failures release the hold. Printing, re-printing, or saving a
          finished draft as PDF never uses credits.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Credits are what you spend here. The Cost page tracks underlying model spend in dollars —
          a separate accounting view, not your balance.
        </p>
      </div>

      {status === "success" && (
        <div
          role="status"
          className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
        >
          Payment received. Your credits are added as soon as Stripe confirms the payment — usually
          within a few seconds.{" "}
          <button
            type="button"
            onClick={() => navigate({ to: "/billing", search: {}, replace: true })}
            className="font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}
      {status === "canceled" && (
        <div
          role="status"
          className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
        >
          Checkout canceled — you were not charged.{" "}
          <button
            type="button"
            onClick={() => navigate({ to: "/billing", search: {}, replace: true })}
            className="font-medium underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Balance
        </p>
        <p className="mt-1 font-serif text-4xl tabular-nums">
          {balanceLoading ? "…" : (balance ?? 0)}{" "}
          <span className="text-base text-muted-foreground">credit{balance === 1 ? "" : "s"}</span>
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Credit packs</h2>
        {productsLoading && <Skeleton className="h-32 w-full rounded-xl" />}
        {!productsLoading && (products ?? []).length === 0 && (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            Credit packs aren't available yet. Check back soon.
          </p>
        )}
        {(products ?? []).length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(products ?? []).map((p) => (
              <div
                key={p.stripe_price_id}
                className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <p className="text-sm font-medium">{p.name}</p>
                <p className="mt-1 font-serif text-3xl tabular-nums">{p.credits}</p>
                <p className="text-xs text-muted-foreground">credits</p>
                <button
                  type="button"
                  onClick={() => handleBuy(p.stripe_price_id)}
                  disabled={buying !== null}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                >
                  {buying === p.stripe_price_id
                    ? "Redirecting…"
                    : formatPrice(p.amount_cents, p.currency)}
                </button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Payments are handled by Stripe on a secure hosted page. Card details never touch this app.
        </p>
      </section>

      {(purchases ?? []).length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-2xl">Purchases</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {(purchases ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.credits} credits
                    {p.amount_total_cents != null && p.currency
                      ? ` · ${formatPrice(p.amount_total_cents, p.currency)}`
                      : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={
                    "shrink-0 rounded px-2 py-0.5 text-[11px] uppercase tracking-wide " +
                    (p.status === "completed"
                      ? "bg-primary/15 text-primary"
                      : p.status === "pending"
                        ? "bg-muted text-muted-foreground"
                        : "bg-destructive/15 text-destructive")
                  }
                >
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-serif text-2xl">Credit history</h2>
        {ledgerLoading && <Skeleton className="h-24 w-full rounded-xl" />}
        {!ledgerLoading && (ledger ?? []).length === 0 && (
          <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            No credit activity yet.
          </p>
        )}
        {(ledger ?? []).length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card text-sm">
            {(ledger ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{ENTRY_LABELS[e.entry_type] ?? e.entry_type}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </p>
                </div>
                <span
                  className={
                    "shrink-0 font-mono text-sm tabular-nums " +
                    (e.amount > 0 ? "text-primary" : "text-muted-foreground")
                  }
                >
                  {e.amount > 0 ? `+${e.amount}` : e.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
