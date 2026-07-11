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
  const url = Deno.env.get("AGENT_REPO_URL") ??
    "https://github.com/ford-at-home/cozy-core-foundation";
  const m = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`Cannot parse AGENT_REPO_URL: ${url}`);
  return { owner: m[1], repo: m[2] };
}

async function fetchFileFromBranch(
  path: string,
  branch: string,
): Promise<string | null> {
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

/** The deliverable filename each run kind produces (plan v2 §repo layout). */
export function mainFileForKind(kind: string): string {
  switch (kind) {
    case "draft":
      return "draft.md";
    case "revision":
      return "final.md";
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
    default:
      return "proposed";
  }
}

/** Pull the piece files the run should have produced; null-safe per file. */
export async function fetchRunResult(run: RunRow, slug: string) {
  if (!run.branch) return null;
  const dir = `pieces/${slug}`;
  const mainFile = mainFileForKind(run.kind);
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
