// Credit reservation lifecycle shared by the dispatch functions, the Cursor
// webhook, and the reconciler.
//
// Model (docs/BILLING.md): one credit = one completed generation. A hold is
// placed BEFORE dispatch and resolved exactly once at a terminal transition:
//   completed              -> settle (immutable consumption ledger entry)
//   failed / cancelled     -> release (hold returned to the balance)
// Deep-research starts hold 2 credits on the initiating research run; the
// chained compose run points back via agent_runs.parent_run_id and settles
// or releases the parent's reservation.
//
// All money movement happens in SECURITY DEFINER Postgres functions callable
// only by service_role — this module is a thin, failure-tolerant adapter.

// deno-lint-ignore-file no-explicit-any
import { logEvent } from "./observability.ts";

/** Credits held per user-initiated action. */
export const CREDIT_COST = {
  compose: 1, // start-workflow with pasted research/attachments
  research: 2, // start-workflow deep-research (covers the chained compose)
  resynth: 1,
  ready: 1,
  revise: 1,
  followup: 2, // follow-up research pass (covers the chained revised packet)
  document: 1, // final paper (.docx) generation
  presentation: 1, // class presentation (.pptx) generation
} as const;

/**
 * Enforcement switch. "enforce" (default) blocks dispatch when credits are
 * insufficient; "log" observes and records but never blocks — the rollback
 * lever for incidents (see RUNBOOK).
 */
export function creditsEnforced(): boolean {
  return (Deno.env.get("CREDITS_MODE")?.trim().toLowerCase() ?? "enforce") !== "log";
}

export async function getBalance(admin: any, userId: string): Promise<number> {
  const { data } = await admin
    .from("credit_accounts")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.balance ?? 0;
}

export type ReserveOutcome =
  | { ok: true }
  | { ok: false; code: "insufficient_credits"; balance: number }
  | { ok: false; code: "reserve_failed"; message: string };

/**
 * Place the hold for a run. Idempotent on runId (a retried request that
 * resolved to the same run re-uses the existing reservation).
 */
export async function reserveCreditsForRun(
  admin: any,
  args: { userId: string; runId: string; amount: number; reason: string },
): Promise<ReserveOutcome> {
  const { error } = await admin.rpc("reserve_credits", {
    _user_id: args.userId,
    _run_id: args.runId,
    _amount: args.amount,
    _reason: args.reason,
  });
  if (!error) return { ok: true };
  if ((error.message ?? "").includes("insufficient_credits")) {
    const balance = await getBalance(admin, args.userId);
    if (!creditsEnforced()) {
      logEvent("credits", "warn", {
        event: "insufficient_credits_log_only",
        runId: args.runId,
        balance,
        amount: args.amount,
      });
      return { ok: true };
    }
    return { ok: false, code: "insufficient_credits", balance };
  }
  // Infrastructure failure, not a business rejection. In log mode we let the
  // run proceed; in enforce mode we refuse — never dispatch unmetered work.
  logEvent("credits", "error", {
    event: "reserve_failed",
    runId: args.runId,
    message: error.message,
  });
  if (!creditsEnforced()) return { ok: true };
  return { ok: false, code: "reserve_failed", message: error.message };
}

/** The run whose reservation covers this run (self, or chained parent). */
function reservationRunId(run: { id: string; parent_run_id?: string | null }): string {
  return run.parent_run_id ?? run.id;
}

/**
 * Consume the hold after the run's success condition (deliverable fetched,
 * status -> completed). Never throws: a settle failure must not corrupt the
 * completion path — the reconciler's reservation sweep repairs it.
 */
export async function settleRunCredits(
  admin: any,
  run: { id: string; parent_run_id?: string | null },
  source: "edge" | "cursor-webhook" | "reconciler",
): Promise<void> {
  const target = reservationRunId(run);
  try {
    const { error } = await admin.rpc("settle_reservation", { _run_id: target });
    if (error) throw new Error(error.message);
  } catch (err) {
    await recordCreditError(admin, run.id, source, "settle_failed", err);
  }
}

/** Return the hold after a qualifying failure (failed/cancelled/stuck). */
export async function releaseRunCredits(
  admin: any,
  run: { id: string; parent_run_id?: string | null },
  reason: string,
  source: "edge" | "cursor-webhook" | "reconciler",
): Promise<void> {
  const target = reservationRunId(run);
  try {
    const { error } = await admin.rpc("release_reservation", {
      _run_id: target,
      _reason: reason,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    await recordCreditError(admin, run.id, source, "release_failed", err);
  }
}

async function recordCreditError(
  admin: any,
  runId: string,
  source: string,
  eventType: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  logEvent("credits", "error", { event: eventType, runId, message });
  try {
    await admin.from("agent_run_events").insert({
      run_id: runId,
      source,
      event_type: eventType,
      payload: { message },
    });
  } catch {
    // Logging only; nothing more to do.
  }
}

/**
 * Safety net run by the reconciler: resolve holds whose runs reached a
 * terminal state without their reservation being resolved (e.g. a crash
 * between the status update and the settle/release call).
 */
export async function sweepStaleReservations(admin: any): Promise<number> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h grace
  const { data: stale } = await admin
    .from("credit_reservations")
    .select("run_id, agent_runs!credit_reservations_run_id_fkey(status)")
    .eq("status", "held")
    .lt("created_at", cutoff)
    .limit(50);
  let resolved = 0;
  for (const res of stale ?? []) {
    const runStatus = (res as any).agent_runs?.status as string | undefined;
    if (runStatus === "completed") {
      // A research run completes when it chains; its hold settles with the
      // chained compose run, so a completed research parent with a live
      // child is NOT stale. Only settle when no non-terminal child exists.
      const { data: child } = await admin
        .from("agent_runs")
        .select("id, status")
        .eq("parent_run_id", res.run_id)
        .maybeSingle();
      if (child && !["completed", "failed", "cancelled"].includes(child.status)) continue;
      if (child?.status === "completed" || !child) {
        await admin.rpc("settle_reservation", { _run_id: res.run_id });
      } else {
        await admin.rpc("release_reservation", {
          _run_id: res.run_id,
          _reason: "sweep: chained run did not complete",
        });
      }
      resolved++;
    } else if (runStatus === "failed" || runStatus === "cancelled") {
      await admin.rpc("release_reservation", {
        _run_id: res.run_id,
        _reason: `sweep: run ${runStatus}`,
      });
      resolved++;
    }
  }
  return resolved;
}
