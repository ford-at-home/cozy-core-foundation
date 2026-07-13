import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { brand, pageTitle } from "@/config/brand";
import {
  joinCourse,
  listAssignmentsForCourses,
  listCourses,
  type Assignment,
  type Course,
} from "@/lib/courses";
import { startWorkflow } from "@/lib/workflows.functions";
import { CREDIT_COST, isInsufficientCreditsError, useCreditBalance } from "@/lib/use-credits";

// The student side of Phase 8: join a course with the code your professor
// shares, then start each assignment as a research packet. The topic comes
// from the assignment — the server verifies enrollment and never trusts a
// client-supplied topic for assignment starts.
export const Route = createFileRoute("/_authenticated/assignments")({
  head: () => ({
    meta: [{ title: pageTitle("Assignments") }, { name: "robots", content: "noindex" }],
  }),
  component: AssignmentsPage,
});

type MyPiece = { id: string; assignment_id: string | null };

// pieces.assignment_id isn't in the generated types yet (they regenerate via
// Lovable tooling); cast like src/lib/packets.ts until then.
const db = supabase as unknown as SupabaseClient;

function AssignmentsPage() {
  const router = useRouter();
  const start = useServerFn(startWorkflow);
  const { balance } = useCreditBalance();
  const [courses, setCourses] = useState<Course[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [myPieces, setMyPieces] = useState<MyPiece[]>([]);
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cost = CREDIT_COST.research;
  const outOfCredits = balance !== null && balance < cost;

  const reload = useCallback(async () => {
    const { data: userData } = await supabase.auth.getUser();
    const courseRows = await listCourses();
    // Show only courses the user is enrolled in (professors have /teach).
    const enrolled = courseRows.filter((c) => c.professor_id !== userData.user?.id);
    setCourses(enrolled);
    setAssignments(await listAssignmentsForCourses(enrolled.map((c) => c.id)));
    const { data: pieces } = await db
      .from("pieces")
      .select("id, assignment_id")
      .not("assignment_id", "is", null);
    setMyPieces((pieces ?? []) as MyPiece[]);
  }, []);

  useEffect(() => {
    reload().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [reload]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy("join");
    setError(null);
    setJoined(null);
    try {
      const { courseName } = await joinCourse(code);
      setJoined(courseName);
      setCode("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the course");
    } finally {
      setBusy(null);
    }
  }

  async function handleStart(assignment: Assignment) {
    if (busy) return;
    setBusy(assignment.id);
    setError(null);
    try {
      const { runId } = await start({
        data: {
          workflow: "research_packet",
          assignmentId: assignment.id,
          requestId: crypto.randomUUID(),
        },
      });
      router.navigate({ to: "/runs/$runId", params: { runId } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start";
      setError(
        isInsufficientCreditsError(message)
          ? "Not enough credits for this generation. You were not charged."
          : message,
      );
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {brand.product.name}
        </p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Assignments</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Join your course with the code from your professor, then start each assignment here.
          Starting an assignment researches its topic and builds your packet ({cost} credits).
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {joined && (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          You're in — welcome to {joined}.
        </p>
      )}

      <form
        onSubmit={handleJoin}
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:p-5"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Course join code (e.g. A1B2C3)"
          aria-label="Course join code"
          autoCapitalize="characters"
          className="min-h-11 w-full rounded-md border border-input bg-background/60 px-3.5 font-mono text-base uppercase tracking-[0.15em] outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
        />
        <button
          type="submit"
          disabled={busy !== null || code.trim() === ""}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        >
          {busy === "join" ? "Joining…" : "Join course"}
        </button>
      </form>

      {outOfCredits && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          Starting an assignment uses {cost} credits and you have {balance}.{" "}
          <Link to="/billing" className="font-medium underline">
            Get credits →
          </Link>
        </div>
      )}

      {courses.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You're not in any courses yet. Working on your own?{" "}
          <Link to="/new" className="underline hover:text-foreground">
            Start a research packet without a course →
          </Link>
        </p>
      )}

      {courses.map((course) => {
        const courseAssignments = assignments.filter((a) => a.course_id === course.id);
        return (
          <section
            key={course.id}
            className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6"
          >
            <h2 className="font-serif text-2xl">{course.name}</h2>
            {courseAssignments.length === 0 && (
              <p className="text-sm text-muted-foreground">No assignments posted yet.</p>
            )}
            {courseAssignments.map((a) => {
              const mine = myPieces.find((p) => p.assignment_id === a.id);
              return (
                <div
                  key={a.id}
                  className="flex flex-col gap-3 rounded-md border border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {a.topic}
                    </p>
                  </div>
                  {mine ? (
                    <Link
                      to="/projects/$pieceId"
                      params={{ pieceId: mine.id }}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      Continue →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStart(a)}
                      disabled={busy !== null || outOfCredits}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                    >
                      {busy === a.id ? "Starting…" : `Start (${cost} credits)`}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
