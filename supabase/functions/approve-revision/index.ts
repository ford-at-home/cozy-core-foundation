// approve-revision — squash-merge the revision run's open pull request on
// GitHub, then stamp `pieces.final_pr_merged_at` so the UI can show the
// piece as shipped. Idempotent: a PR that's already merged returns ok.
//
// Auth: JWT-authenticated caller must own the piece. Ownership is checked
// on the service-role client (RLS bypassed here by design).
// GitHub auth: fine-grained PAT stored as GITHUB_TOKEN (Contents + Pull
// requests: read/write on the AGENT_REPO_URL repo).

// deno-lint-ignore-file no-explicit-any
import { serve, authenticate, j, e } from "../_shared/http.ts";
import { logPieceEvent } from "../_shared/workflow.ts";

const FN = "approve-revision";

function repoOwnerName(): { owner: string; repo: string } {
  const url =
    Deno.env.get("AGENT_REPO_URL") ?? "https://github.com/ford-at-home/cozy-core-foundation";
  const m = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`Cannot parse AGENT_REPO_URL: ${url}`);
  return { owner: m[1], repo: m[2] };
}

function ghHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function prNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = url.match(/\/pull\/(\d+)/);
  return m ? Number(m[1]) : null;
}

async function findPrByBranch(
  token: string,
  branch: string,
): Promise<{ number: number; state: string; merged: boolean; html_url: string } | null> {
  const { owner, repo } = repoOwnerName();
  // The head filter needs `owner:branch`.
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&head=${encodeURIComponent(
    `${owner}:${branch}`,
  )}&per_page=5`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (!res.ok) return null;
  const list = (await res.json()) as Array<any>;
  if (!Array.isArray(list) || list.length === 0) return null;
  // Prefer an open PR; otherwise the most recent.
  const open = list.find((p) => p.state === "open");
  const pick = open ?? list[0];
  return {
    number: Number(pick.number),
    state: String(pick.state),
    merged: Boolean(pick.merged_at),
    html_url: String(pick.html_url ?? ""),
  };
}

Deno.serve(
  serve(FN, async (req, rid) => {
    const { userId, admin } = await authenticate(req);
    const body = await req.json().catch(() => ({}));
    const runId = typeof body?.runId === "string" ? body.runId : "";
    if (!runId) return e(FN, 400, "runId required", { requestId: rid, code: "invalid_input" });

    const token = Deno.env.get("GITHUB_TOKEN")?.trim();
    if (!token)
      return e(FN, 500, "GitHub token not configured", {
        requestId: rid,
        code: "no_github_token",
      });

    const { data: run } = await admin
      .from("agent_runs")
      .select("id, user_id, piece_id, kind, status, branch")
      .eq("id", runId)
      .maybeSingle();
    if (!run || run.user_id !== userId)
      return e(FN, 404, "Run not found", { requestId: rid, code: "not_found" });
    if (run.kind !== "revision")
      return e(FN, 409, "Only revision runs can be approved", {
        requestId: rid,
        code: "wrong_kind",
      });
    if (run.status !== "completed")
      return e(FN, 409, "Run has not completed", { requestId: rid, code: "not_completed" });
    if (!run.piece_id) return e(FN, 409, "Run has no piece", { requestId: rid, code: "no_piece" });

    const { data: piece } = await admin
      .from("pieces")
      .select("id, user_id, final_pr_url, final_pr_merged_at, slug")
      .eq("id", run.piece_id)
      .maybeSingle();
    if (!piece || piece.user_id !== userId)
      return e(FN, 404, "Piece not found", { requestId: rid, code: "piece_not_found" });

    if (piece.final_pr_merged_at) {
      return j({ ok: true, alreadyMerged: true, prUrl: piece.final_pr_url ?? null }, 200, rid);
    }

    // Resolve PR number: prefer the URL already persisted at completion; fall
    // back to a branch lookup for older runs or when Cursor omitted it.
    let prNumber = prNumberFromUrl(piece.final_pr_url);
    let prUrl = piece.final_pr_url ?? null;
    if (!prNumber && run.branch) {
      const found = await findPrByBranch(token, run.branch);
      if (found) {
        prNumber = found.number;
        prUrl = found.html_url || prUrl;
        if (found.merged) {
          await admin
            .from("pieces")
            .update({
              final_pr_url: prUrl,
              final_pr_merged_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", piece.id);
          return j({ ok: true, alreadyMerged: true, prUrl }, 200, rid);
        }
      }
    }
    if (!prNumber)
      return e(FN, 404, "No open pull request found for this run", {
        requestId: rid,
        code: "pr_not_found",
      });

    const { owner, repo } = repoOwnerName();
    const mergeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`,
      {
        method: "PUT",
        headers: { ...ghHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({
          merge_method: "squash",
          commit_title: `Approve ${piece.slug} (PR #${prNumber})`,
        }),
      },
    );

    if (mergeRes.status === 405 || mergeRes.status === 409) {
      // Not mergeable (conflicts, checks required, branch protection, etc.)
      const detail = await mergeRes.text().catch(() => "");
      return e(FN, 409, "GitHub refused the merge", {
        requestId: rid,
        code: "not_mergeable",
        details: { status: mergeRes.status, body: detail.slice(0, 500), prUrl },
      });
    }
    if (!mergeRes.ok) {
      const detail = await mergeRes.text().catch(() => "");
      return e(FN, 502, "GitHub merge failed", {
        requestId: rid,
        code: "github_error",
        details: { status: mergeRes.status, body: detail.slice(0, 500), prUrl },
      });
    }

    const mergedAt = new Date().toISOString();
    await admin
      .from("pieces")
      .update({
        final_pr_url: prUrl,
        final_pr_merged_at: mergedAt,
        stage: "finalized",
        updated_at: mergedAt,
      })
      .eq("id", piece.id);

    await logPieceEvent(admin, {
      pieceId: piece.id,
      userId,
      event: "revision_pr_merged",
      metadata: { runId, prNumber, prUrl },
    });

    return j({ ok: true, prUrl, prNumber, mergedAt }, 200, rid);
  }),
);
