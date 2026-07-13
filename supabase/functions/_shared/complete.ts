// Shared completion logic for cursor-webhook and reconcile-runs: apply an
// observed external status to a run (monotonically), and on FINISHED fetch
// the written files back from the agent's branch so the UI can render prose.
//
// Retrieval path: GitHub contents API against the run's branch. This repo is
// public today, so no token is needed; if it goes private, set GITHUB_TOKEN
// (read-only, this repo only) in the function env — never in the agent env.

// deno-lint-ignore-file no-explicit-any
import { canTransition, mapExternalStatus, type RunState } from "./state.ts";

export interface RunRow {
  id: string;
  piece_id: string | null;
  status: RunState;
  kind: string;
  branch: string | null;
  input: any;
}

function githubApiBase(): { owner: string; repo: string } {
  const url =
    Deno.env.get("AGENT_REPO_URL") ?? "https://github.com/ford-at-home/cozy-core-foundation";
  const m = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`Cannot parse AGENT_REPO_URL: ${url}`);
  return { owner: m[1], repo: m[2] };
}

async function fetchFileFromBranch(path: string, branch: string): Promise<string | null> {
  const { owner, repo } = githubApiBase();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = Deno.env.get("GITHUB_TOKEN")?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub contents API ${res.status} for ${path}@${branch}`);
  return await res.text();
}

/** Binary-safe read for DOCX/PPTX/PDF deliverables. */
export async function fetchBinaryFromBranch(path: string, branch: string): Promise<Uint8Array | null> {
  const { owner, repo } = githubApiBase();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = Deno.env.get("GITHUB_TOKEN")?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub contents API ${res.status} for ${path}@${branch}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The deliverable filename each run kind produces (plan v2 §repo layout). */
export function mainFileForKind(kind: string): string {
  switch (kind) {
    case "draft":
      return "draft.md";
    case "revision":
      return "final.md";
    case "packet":
      return "packet/packet.md";
    case "followup_research":
      return "followup/report.md";
    case "final_docx":
      return "final/document.docx";
    case "final_pptx":
      return "final/presentation.pptx";
    default:
      return "proposal.md";
  }
}

/** Which pieces column records this kind's PR (approval moments). */
export function prUrlFieldForKind(kind: string): "draft_pr_url" | "final_pr_url" | null {
  if (kind === "draft") return "draft_pr_url";
  if (kind === "revision") return "final_pr_url";
  return null;
}

/** The piece stage a completed run of this kind advances to. */
export function stageForCompletedKind(kind: string): string {
  switch (kind) {
    case "draft":
      return "drafted";
    case "revision":
      return "finalized";
    case "packet":
      // A completed packet is print-ready, like a draft.
      return "drafted";
    case "followup_research":
      return "drafted";
    case "final_docx":
    case "final_pptx":
      return "finalized";
    default:
      return "proposed";
  }
}

/** FSM workflow_stage transition to run when a run of this kind completes. */
export function workflowStageForCompletedKind(kind: string): string | null {
  switch (kind) {
    case "followup_research":
      return "follow_up_research_ready";
    case "final_docx":
      return "final_document_ready";
    case "final_pptx":
      return "presentation_ready";
    default:
      return null;
  }
}

/** FSM workflow_stage transition to run when a run of this kind fails. */
export function workflowStageForFailedKind(_kind: string): string | null {
  // The FSM allows `_ -> failed` from every non-terminal state; return it uniformly.
  return "failed";
}

/** Pull the piece files the run should have produced; null-safe per file. */
export async function fetchRunResult(run: RunRow, slug: string) {
  if (!run.branch) return null;
  const dir = `pieces/${slug}`;
  const mainFile = mainFileForKind(run.kind);

  // Research packets ship the packet body plus two JSON sidecars (structured
  // analysis + tailored questions) that _shared/packet.ts persists to the
  // packets tables. The body is exposed as post.md so the run tabs and the
  // print route work unchanged.
  if (run.kind === "packet") {
    const [main, analysis, questions] = await Promise.all([
      fetchFileFromBranch(`${dir}/${mainFile}`, run.branch),
      fetchFileFromBranch(`${dir}/packet/analysis.json`, run.branch),
      fetchFileFromBranch(`${dir}/packet/questions.json`, run.branch),
    ]);
    if (main === null) return null;
    return {
      brief: null,
      channels: [
        {
          channel: "packet",
          files: [
            { name: "post.md", content: main },
            ...(analysis ? [{ name: "analysis.json", content: analysis }] : []),
            ...(questions ? [{ name: "questions.json", content: questions }] : []),
          ],
        },
      ],
    };
  }

  if (run.kind === "followup_research") {
    // A follow-up run reruns research using the approved follow-up questions;
    // it writes a NEW packet layer (v+1). The three files mirror the packet run.
    const [main, analysis, questions] = await Promise.all([
      fetchFileFromBranch(`${dir}/followup/report.md`, run.branch),
      fetchFileFromBranch(`${dir}/followup/analysis.json`, run.branch),
      fetchFileFromBranch(`${dir}/followup/questions.json`, run.branch),
    ]);
    if (main === null) return null;
    return {
      brief: null,
      channels: [
        {
          channel: "followup",
          files: [
            { name: "post.md", content: main },
            ...(analysis ? [{ name: "analysis.json", content: analysis }] : []),
            ...(questions ? [{ name: "questions.json", content: questions }] : []),
          ],
        },
      ],
    };
  }

  if (run.kind === "final_docx" || run.kind === "final_pptx") {
    // Binary artifact: only presence matters here; the persistor re-downloads
    // the bytes to upload to the private final-artifacts bucket.
    const bin = await fetchBinaryFromBranch(`${dir}/${mainFile}`, run.branch);
    if (bin === null) return null;
    return {
      brief: null,
      channels: [
        {
          channel: "final",
          files: [{ name: mainFile.split("/").pop() ?? "artifact", byteLength: bin.byteLength }],
        },
      ],
    };
  }

  const [main, brief, toResearch, tighten, unresolved] = await Promise.all([
    fetchFileFromBranch(`${dir}/${mainFile}`, run.branch),
    fetchFileFromBranch(`${dir}/brief.md`, run.branch),
    fetchFileFromBranch(`${dir}/notes/to-research.md`, run.branch),
    fetchFileFromBranch(`${dir}/notes/tighten.md`, run.branch),
    fetchFileFromBranch(`${dir}/notes/unresolved.md`, run.branch),
  ]);
  if (main === null) return null; // agent finished but the deliverable isn't there (yet)
  return {
    brief: brief ? { content: brief } : null,
    channels: [
      {
        channel: "longform",
        files: [
          { name: "post.md", content: main },
          ...(toResearch ? [{ name: "to-research.md", content: toResearch }] : []),
          ...(tighten ? [{ name: "tighten.md", content: tighten }] : []),
          ...(unresolved ? [{ name: "unresolved.md", content: unresolved }] : []),
        ],
      },
    ],
  };
}

/**
 * Apply an externally observed status to a run row. Returns the update
 * object to persist, or null when no legal transition applies (unknown
 * status, stale event, or out-of-order delivery — all safely ignored).
 */
export function applyExternalStatus(
  run: RunRow,
  rawStatus: string,
): { status: RunState; error?: string } | null {
  const mapped = mapExternalStatus(rawStatus);
  if (!mapped) return null; // unknown vendor status -> non-terminal hold
  if (mapped === run.status) return null;
  if (!canTransition(run.status, mapped)) return null; // monotonic guard
  if (mapped === "failed") return { status: "failed", error: `Agent reported ${rawStatus}` };
  return { status: mapped };
}
