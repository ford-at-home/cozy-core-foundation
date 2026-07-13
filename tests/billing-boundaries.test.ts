// Cross-feature drift guards for the billing boundary that lives on both
// sides of the client/server split.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CREDIT_COST, isInsufficientCreditsError } from "@/lib/use-credits";
import { FOLLOWUP_RESEARCH_COST } from "@/lib/followup.functions";
import { FINAL_ARTIFACT_COST } from "@/lib/final-artifacts.functions";

const ROOT = join(__dirname, "..");

function parseCreditCost(source: string): Record<string, number> {
  const block = source.match(/CREDIT_COST = \{([\s\S]*?)\} as const/);
  if (!block) throw new Error("CREDIT_COST block not found");
  const entries: Record<string, number> = {};
  for (const m of block[1].matchAll(/^\s*(\w+):\s*(\d+),/gm)) {
    entries[m[1]] = Number(m[2]);
  }
  return entries;
}

describe("credit costs", () => {
  it("client mirror matches the server source of truth", () => {
    // The server file is Deno code, so compare by parsing rather than import.
    const server = parseCreditCost(
      readFileSync(join(ROOT, "supabase/functions/_shared/credits.ts"), "utf8"),
    );
    expect(server).toEqual({ ...CREDIT_COST });
  });

  it("every action costs at least one credit", () => {
    for (const cost of Object.values(CREDIT_COST)) {
      expect(cost).toBeGreaterThanOrEqual(1);
    }
  });

  // The packet-workflow functions declare their reserve amount as a local
  // `const COST = n` rather than through CREDIT_COST; the UI shows the
  // client mirror on every billable button, so drift = lying to the student.
  function serverCost(fn: string): number {
    const source = readFileSync(join(ROOT, "supabase/functions", fn, "index.ts"), "utf8");
    const m = source.match(/^const COST = (\d+);/m);
    if (!m) throw new Error(`const COST not found in ${fn}`);
    return Number(m[1]);
  }

  it("follow-up research client mirror matches run-follow-up-research", () => {
    expect(serverCost("run-follow-up-research")).toBe(FOLLOWUP_RESEARCH_COST);
  });

  it("final artifact client mirror matches both artifact job functions", () => {
    expect(serverCost("create-final-document-job")).toBe(FINAL_ARTIFACT_COST);
    expect(serverCost("create-presentation-job")).toBe(FINAL_ARTIFACT_COST);
  });
});

describe("paywall error detection", () => {
  it("recognizes the edge-function insufficient-credits error shapes", () => {
    expect(isInsufficientCreditsError("insufficient_credits")).toBe(true);
    expect(isInsufficientCreditsError("Error: insufficient_credits for user")).toBe(true);
    expect(isInsufficientCreditsError("Not enough credits")).toBe(true);
  });

  it("does not misclassify unrelated errors as paywall", () => {
    expect(isInsufficientCreditsError("network error")).toBe(false);
    expect(isInsufficientCreditsError("insufficient permissions")).toBe(false);
    expect(isInsufficientCreditsError("")).toBe(false);
  });
});

describe("checkout return flow (UI honesty)", () => {
  it("the billing page never grants credits from the redirect", () => {
    const billing = readFileSync(join(ROOT, "src/routes/_authenticated/billing.tsx"), "utf8");
    // The success banner is display-only: the page may invalidate/refetch the
    // balance, but must never write credit state. Any client-side call into
    // the money functions is a violation of docs/BILLING.md.
    for (const forbidden of [
      "grant_credits",
      "reserve_credits",
      "settle_reservation",
      "release_reservation",
      'from("credit_ledger").insert',
      'from("credit_accounts").update',
    ]) {
      expect(billing, `billing.tsx must not call ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("the billing page handles both checkout return states", () => {
    const billing = readFileSync(join(ROOT, "src/routes/_authenticated/billing.tsx"), "utf8");
    expect(billing).toContain("success");
    expect(billing).toContain("canceled");
  });
});
