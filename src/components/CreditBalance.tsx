import { Link } from "@tanstack/react-router";
import { Coins } from "lucide-react";
import { useCreditBalance } from "@/lib/use-credits";

/**
 * Discreet header chip: current balance, links to /billing. Amber when the
 * user is down to their last credit so the low-balance state is visible
 * without shouting.
 */
export function CreditBalance() {
  const { balance, isLoading } = useCreditBalance();
  const low = balance !== null && balance <= 1;

  return (
    <Link
      to="/billing"
      aria-label={
        balance === null ? "Credits" : `${balance} credit${balance === 1 ? "" : "s"} — billing`
      }
      className={
        "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
        (low
          ? "border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground")
      }
    >
      <Coins className="h-3.5 w-3.5" aria-hidden />
      <span className="tabular-nums font-medium">{isLoading ? "…" : (balance ?? "—")}</span>
    </Link>
  );
}
