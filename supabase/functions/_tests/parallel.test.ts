import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResearchQuery, buildResearchReport, mapParallelStatus } from "../_shared/parallel.ts";

Deno.test("parallel status maps onto the run state machine", () => {
  assertEquals(mapParallelStatus("queued"), "queued");
  assertEquals(mapParallelStatus("running"), "running");
  assertEquals(mapParallelStatus("action_required"), "running");
  assertEquals(mapParallelStatus("completed"), "awaiting_fetch");
  assertEquals(mapParallelStatus("failed"), "failed");
  assertEquals(mapParallelStatus("cancelled"), "failed");
  // Forward-compat: unknown statuses hold, never terminate.
  assertEquals(mapParallelStatus("some_new_status"), null);
});

Deno.test("research query demands inline citations", () => {
  const q = buildResearchQuery("  RVA civic tech scene  ");
  assert(q.includes("EVERY claim must carry its source URL inline"));
  assert(q.includes("TOPIC: RVA civic tech scene"));
});

Deno.test("research report carries provenance frontmatter", () => {
  const report = buildResearchReport({
    topic: 'The "handoff" problem',
    processor: "ultra-fast",
    parallelRunId: "trun_abc123",
    content: "# Findings\n\nA claim [source](https://example.com/a).",
    sourceUrls: ["https://example.com/a", "https://example.com/b"],
  });
  assert(report.startsWith("---\n"));
  assert(report.includes("source: parallel-deep-research"));
  assert(report.includes('query: "The \\"handoff\\" problem"'));
  assert(report.includes("run_id: trun_abc123"));
  // URL already inline is not duplicated; missing one is appended as evidence.
  assertEquals(report.match(/example\.com\/a/g)?.length, 1);
  assert(report.includes("## Additional sources (from research evidence)"));
  assert(report.includes("- <https://example.com/b>"));
});

Deno.test("report without missing sources gets no evidence appendix", () => {
  const report = buildResearchReport({
    topic: "t",
    processor: "pro-fast",
    parallelRunId: "trun_x",
    content: "Body with [link](https://example.com/a).",
    sourceUrls: ["https://example.com/a"],
  });
  assert(!report.includes("Additional sources"));
});
