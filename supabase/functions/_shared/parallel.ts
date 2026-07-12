// Parallel AI Task API client for deep-research runs. Mirrors the calling
// convention proven in openclaw's tools/parallel-research.sh:
//   POST /v1/tasks/runs  {input, processor, task_spec}  -> {run_id, status}
//   GET  /v1/tasks/runs/{id}                            -> {status, ...}
//   GET  /v1/tasks/runs/{id}/result                     -> {output: {content, basis}}
//
// The key (PARALLEL_API_KEY) is a backend secret; it never reaches the
// browser or any agent VM. Research runs are polled by the reconciler —
// never awaited inside a request handler (deep research takes minutes).

import { ProviderHttpError } from "./provider.ts";
import type { RunState } from "./state.ts";

const BASE = "https://api.parallel.ai/v1/tasks/runs";

/** Depth of research. ultra-fast = multi-source deep research (1-10 min). */
export const DEFAULT_PROCESSOR = "ultra-fast";
export const PROCESSORS = [
  "lite-fast",
  "base-fast",
  "core-fast",
  "pro-fast",
  "ultra-fast",
] as const;

export interface ParallelTask {
  runId: string;
  rawStatus: string;
}

export interface ResearchResult {
  /** The report body (markdown/text as returned by Parallel). */
  content: string;
  /** Source URLs extracted from the result basis (citation evidence). */
  sourceUrls: string[];
}

function apiKey(): string {
  const key = Deno.env.get("PARALLEL_API_KEY")?.trim();
  if (!key) throw new Error("PARALLEL_API_KEY is not configured");
  return key;
}

async function parallelFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey(),
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderHttpError(res.status, `Parallel API: ${body.slice(0, 300)}`);
  }
  return res;
}

export function resolveProcessor(): string {
  const p = Deno.env.get("PARALLEL_PROCESSOR")?.trim();
  return p && (PROCESSORS as readonly string[]).includes(p) ? p : DEFAULT_PROCESSOR;
}

export async function createResearchTask(
  topic: string,
  processor: string,
): Promise<ParallelTask> {
  const res = await parallelFetch("", {
    method: "POST",
    body: JSON.stringify({
      input: buildResearchQuery(topic),
      processor,
      task_spec: { output_schema: { type: "text" } },
    }),
  });
  const json = await res.json();
  const runId = json?.run_id;
  if (typeof runId !== "string" || !runId) {
    throw new Error(`Parallel API returned no run_id: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { runId, rawStatus: String(json?.status ?? "queued") };
}

export async function getResearchTask(runId: string): Promise<ParallelTask> {
  const res = await parallelFetch(`/${encodeURIComponent(runId)}`);
  const json = await res.json();
  return { runId, rawStatus: String(json?.status ?? "") };
}

export async function getResearchResult(runId: string): Promise<ResearchResult> {
  const res = await parallelFetch(`/${encodeURIComponent(runId)}/result`);
  const json = await res.json();
  const output = json?.output;
  const content = typeof output?.content === "string"
    ? output.content
    : typeof output === "string"
    ? output
    : JSON.stringify(output ?? json);
  return { content, sourceUrls: extractSourceUrls(output?.basis) };
}

/**
 * Map a Parallel task status onto our run state machine. Unknown statuses
 * hold (null) — same forward-compat rule as the Cursor mapping.
 */
export function mapParallelStatus(raw: string): RunState | null {
  switch (raw.toLowerCase()) {
    case "queued":
      return "queued";
    case "action_required": // needs input we can't give; hold, timeout will fail it
    case "running":
      return "running";
    case "completed":
      return "awaiting_fetch"; // done only after the report is fetched + chained
    case "failed":
      return "failed";
    case "cancelled":
    case "canceled":
      return "failed"; // we never cancel research; treat vendor-side cancel as failure
    default:
      return null;
  }
}

/** Frame the topic so the report comes back usable as writing research. */
export function buildResearchQuery(topic: string): string {
  return `Produce a deep research report on the following topic. Requirements:
- Structured markdown: an executive summary, then sections by theme.
- Concrete facts, numbers, dates, and named actors over generalities.
- EVERY claim must carry its source URL inline as a markdown link.
- Include a final "Sources" section listing every URL used.
- Note open questions and conflicting evidence where sources disagree.

TOPIC: ${topic.trim()}`;
}

/**
 * Wrap the raw report with provenance frontmatter (mirrors openclaw's
 * research-and-publish.sh). This exact text is what the compose agent
 * commits to pieces/<slug>/research/research.md — the versioned copy.
 */
export function buildResearchReport(args: {
  topic: string;
  processor: string;
  parallelRunId: string;
  content: string;
  sourceUrls: string[];
}): string {
  const date = new Date().toISOString();
  const header = `---
source: parallel-deep-research
query: ${JSON.stringify(args.topic.trim())}
processor: ${args.processor}
run_id: ${args.parallelRunId}
date: "${date}"
---

`;
  let body = args.content.trim();
  // Belt-and-braces: if the report text lost its URLs, append the citation
  // evidence from the result basis so downstream synthesis can still link.
  const missing = args.sourceUrls.filter((u) => !body.includes(u));
  if (missing.length > 0) {
    body += `\n\n## Additional sources (from research evidence)\n${
      missing.map((u) => `- <${u}>`).join("\n")
    }`;
  }
  return header + body + "\n";
}

function extractSourceUrls(basis: unknown): string[] {
  const urls = new Set<string>();
  if (Array.isArray(basis)) {
    for (const field of basis) {
      const citations = (field as Record<string, unknown>)?.citations;
      if (!Array.isArray(citations)) continue;
      for (const c of citations) {
        const url = (c as Record<string, unknown>)?.url;
        if (typeof url === "string" && url.startsWith("http")) urls.add(url);
      }
    }
  }
  return [...urls];
}
