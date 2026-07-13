// interpretRunError must always produce calm, student-readable copy and must
// NEVER pass a raw provider body (JSON dumps, HTTP traces) through to the UI.
import { describe, expect, it } from "vitest";
import { interpretRunError } from "../src/lib/run-error";

// Real message shapes written by the backend (see run-error.ts header).
const RAW_SAMPLES = [
  `Provider responded 500: {"error":{"message":"upstream timeout","type":"server_error","trace_id":"abc-123"}}`,
  "Provider responded 429: You exceeded your current quota. Please increase your hard limit.",
  "Not enough credits for this generation.",
  "Deep research exceeded 45 minutes (last Parallel status: running). Resubmit the topic.",
  "Research dispatch was never confirmed. Resubmit the topic.",
  "Agent not found at provider (deleted or expired).",
  "The generated file was invalid and was not published. word/document.xml is only 12 bytes — truncated or empty document",
  "Agent reported EXPIRED",
  "TypeError: fetch failed: connection reset by peer at https://internal-host:8443/v1/tasks",
];

describe("interpretRunError", () => {
  it("returns null only for empty input", () => {
    expect(interpretRunError(null)).toBeNull();
    expect(interpretRunError(undefined)).toBeNull();
    expect(interpretRunError("")).toBeNull();
    expect(interpretRunError("   ")).toBeNull();
    for (const raw of RAW_SAMPLES) {
      expect(interpretRunError(raw)).not.toBeNull();
    }
  });

  it("never renders raw provider bodies, JSON, or URLs", () => {
    for (const raw of RAW_SAMPLES) {
      const detail = interpretRunError(raw);
      const rendered = `${detail?.title} ${detail?.body}`;
      expect(rendered).not.toContain("{");
      expect(rendered).not.toContain("trace_id");
      expect(rendered).not.toContain("https://");
      expect(rendered).not.toContain("TypeError");
      expect(rendered).not.toContain("EXPIRED");
    }
  });

  it("keeps the no-charge promise in every failure explanation", () => {
    // Money copy rule (docs/BILLING.md): a failed run never quietly costs a
    // credit, and the UI always says so.
    for (const raw of RAW_SAMPLES) {
      const detail = interpretRunError(raw);
      const rendered = `${detail?.title} ${detail?.body}`.toLowerCase();
      expect(
        rendered.includes("not charged") ||
          rendered.includes("cost you nothing") ||
          rendered.includes("no credits were charged"),
      ).toBe(true);
    }
  });

  it("explains the spending-limit case as the owner's problem, not the student's", () => {
    const detail = interpretRunError("Please increase your hard limit before retrying.");
    expect(detail?.title).toContain("spending limit");
    expect(detail?.body).toContain("site owner");
  });

  it("explains insufficient credits with the fix", () => {
    const detail = interpretRunError("insufficient_credits: balance 0, required 2");
    expect(detail?.body).toContain("Billing");
  });
});
