import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { brand, pageTitle } from "@/config/brand";
import {
  FUNCTION_LABELS,
  RESPONSE_SPACES,
  RESPONSE_SPACE_LABELS,
  addPacketQuestion,
  approvePacket,
  deletePacketQuestion,
  getPacketByRunId,
  listPacketQuestions,
  updatePacketQuestion,
  type Packet,
  type PacketQuestion,
  type ResponseSpace,
} from "@/lib/packets";
import { Skeleton } from "@/components/ui/skeleton";

// Review the generated research-packet questions before printing: edit,
// lock, add, approve. Question text is the owner's content (RLS-scoped
// writes); packet rows are created by the backend at fetch-back and the
// owner can only flip status generated → reviewed here.
export const Route = createFileRoute("/_authenticated/packet/$runId")({
  head: () => ({
    meta: [{ title: pageTitle("Review packet") }, { name: "robots", content: "noindex" }],
  }),
  component: PacketReviewPage,
});

function PacketReviewPage() {
  const { runId } = Route.useParams();
  const [packet, setPacket] = useState<Packet | null>(null);
  const [questions, setQuestions] = useState<PacketQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const p = await getPacketByRunId(runId);
      setPacket(p);
      setQuestions(p ? await listPacketQuestions(p.id) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load packet");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  async function handleApprove() {
    if (!packet || busy) return;
    setBusy(true);
    setError(null);
    try {
      await approvePacket(packet.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  const reviewed = packet?.status === "reviewed";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Review questions</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            These questions were written for this packet's specific findings — each names the claim
            or evidence it interrogates. Edit any wording, lock the ones that must stay, add your
            own, then approve and print.
          </p>
        </div>
        <Link
          to="/runs/$runId"
          params={{ runId }}
          className="inline-flex min-h-11 shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm sm:min-h-0"
        >
          ← Back to run
        </Link>
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading packet">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      )}

      {!loading && error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {!loading && !error && !packet && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No packet found for this run yet. If the run just completed, give it a moment and reload —
          the questions are persisted right after the packet is fetched back.
        </div>
      )}

      {packet && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span
              className={
                "rounded-full border px-3 py-1 text-xs font-medium " +
                (reviewed
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-amber-500/40 bg-amber-500/10")
              }
            >
              {reviewed ? "Reviewed — ready to print" : "Awaiting your review"}
            </span>
            <span className="text-xs text-muted-foreground">
              packet {packet.id.slice(0, 8)} · v{packet.version} · {questions.length} question
              {questions.length === 1 ? "" : "s"}
            </span>
          </div>

          <ol className="space-y-4">
            {questions.map((q, i) => (
              <QuestionCard
                key={q.id}
                question={q}
                index={i}
                onChanged={reload}
                onError={setError}
              />
            ))}
          </ol>

          {questions.length === 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
              The generated questions didn't pass validation, so none were saved. Add your own below
              — the packet body is unaffected.
            </div>
          )}

          <AddQuestionForm
            packetId={packet.id}
            // Max position + 1, not last-item position + 1: the list is in
            // print order (followup last), which is not position order.
            nextPosition={questions.reduce((m, q) => Math.max(m, q.position), 0) + 1}
            onAdded={reload}
            onError={setError}
          />

          <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Reviewing, editing, and printing are free. Approving doesn't lock editing — you can
              come back.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {!reviewed ? (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={busy}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
                >
                  {busy ? "Approving…" : "Approve questions"}
                </button>
              ) : (
                <Link
                  to="/print/$runId"
                  params={{ runId }}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
                >
                  Print the packet →
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  onChanged,
  onError,
}: {
  question: PacketQuestion;
  index: number;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.prompt);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSaving(true);
    onError(null);
    try {
      await updatePacketQuestion(question.id, { prompt: trimmed, edited: true });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleLock() {
    onError(null);
    try {
      await updatePacketQuestion(question.id, { locked: !question.locked });
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Update failed");
    }
  }

  async function remove() {
    onError(null);
    try {
      await deletePacketQuestion(question.id);
      await onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className="font-mono font-semibold text-foreground">Q{index + 1}</span>
        <span>{FUNCTION_LABELS[question.function]}</span>
        {question.claim_ref && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono normal-case">
            refers to {question.claim_ref}
          </span>
        )}
        <span className="normal-case tracking-normal">
          {RESPONSE_SPACE_LABELS[question.response_space]}
        </span>
        {question.locked && (
          <span className="rounded border border-border px-1.5 py-0.5 normal-case tracking-normal">
            locked
          </span>
        )}
        {question.edited && <span className="normal-case tracking-normal">edited</span>}
        {question.source === "user" && <span className="normal-case tracking-normal">yours</span>}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={save}
              disabled={saving || draft.trim() === ""}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(question.prompt);
                setEditing(false);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed">{question.prompt}</p>
      )}
      {!editing && question.guidance && (
        <p className="mt-2 text-xs italic text-muted-foreground">{question.guidance}</p>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={toggleLock}
            className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
          >
            {question.locked ? "Unlock" : "Lock"}
          </button>
          {question.source === "user" && !question.locked && (
            <button
              type="button"
              onClick={remove}
              className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function AddQuestionForm({
  packetId,
  nextPosition,
  onAdded,
  onError,
}: {
  packetId: string;
  nextPosition: number;
  onAdded: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [space, setSpace] = useState<ResponseSpace>("lines_5");
  const [saving, setSaving] = useState(false);

  async function add() {
    const trimmed = prompt.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    onError(null);
    try {
      await addPacketQuestion({
        packetId,
        position: nextPosition,
        prompt: trimmed,
        functionName: "ground_truth",
        responseSpace: space,
      });
      setPrompt("");
      setOpen(false);
      await onAdded();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-dashed border-border px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
      >
        + Add a question
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your question
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Tie it to a specific finding, source, or stakeholder in this packet."
          className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Writing space
        </span>
        <select
          value={space}
          onChange={(e) => setSpace(e.target.value as ResponseSpace)}
          className="w-full min-h-11 rounded-md border border-input bg-background/60 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
        >
          {RESPONSE_SPACES.map((s) => (
            <option key={s} value={s}>
              {RESPONSE_SPACE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={add}
          disabled={saving || prompt.trim() === ""}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
        >
          {saving ? "Adding…" : "Add question"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:w-auto"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
