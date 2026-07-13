// Cross-feature guard: the frontend's CREDIT_COST mirror must match the
// server's canonical table. The two live in different runtimes (Vite app vs
// Deno edge functions) and cannot share an import, so drift is caught by
// parsing both sources. If this fails, someone changed a price on one side
// only — the paywall UI and the server's reservations would disagree.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function parseCreditCost(source: string, file: string): Record<string, number> {
  const match = source.match(/export const CREDIT_COST = \{([\s\S]*?)\}/);
  if (!match) throw new Error(`CREDIT_COST object not found in ${file}`);
  const costs: Record<string, number> = {};
  for (const line of match[1].split("\n")) {
    const entry = line.match(/^\s*(\w+):\s*(\d+)\s*,?\s*(?:\/\/.*)?$/);
    if (entry) costs[entry[1]] = Number(entry[2]);
  }
  if (Object.keys(costs).length === 0) {
    throw new Error(`CREDIT_COST parsed empty in ${file}`);
  }
  return costs;
}

describe("CREDIT_COST mirror", () => {
  const serverFile = "supabase/functions/_shared/credits.ts";
  const clientFile = "src/lib/use-credits.ts";
  const server = parseCreditCost(readFileSync(resolve(ROOT, serverFile), "utf8"), serverFile);
  const client = parseCreditCost(readFileSync(resolve(ROOT, clientFile), "utf8"), clientFile);

  it("frontend mirror matches the server's canonical costs", () => {
    expect(client).toEqual(server);
  });

  it("covers every billable action", () => {
    expect(Object.keys(server).sort()).toEqual(
      ["compose", "ready", "research", "resynth", "revise"].sort(),
    );
  });
});
