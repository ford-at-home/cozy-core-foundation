import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { brand, pageTitle } from "@/config/brand";
import {
  createAssignment,
  createCourse,
  deleteAssignment,
  isProfessor,
  listAssignmentPieces,
  listAssignments,
  listCourses,
  listRoster,
  type Assignment,
  type AssignmentPiece,
  type Course,
} from "@/lib/courses";
import { listPacketsByPieceId, type Packet } from "@/lib/packets";
import { listReturnsForPackets, type PacketReturn } from "@/lib/returns";
import { Skeleton } from "@/components/ui/skeleton";

// The professor's home (Phase 8, minimal): courses with join codes,
// assignments, rosters, and per-student progress. Question review reuses
// the student-facing packet review screen — the professor's RLS grants make
// it work on enrolled students' packets. This page is unreachable-by-
// content for non-professors (course creation is role-gated in RLS too).
export const Route = createFileRoute("/_authenticated/teach")({
  head: () => ({
    meta: [{ title: pageTitle("Teach") }, { name: "robots", content: "noindex" }],
  }),
  component: TeachPage,
});

function TeachPage() {
  const [professor, setProfessor] = useState<boolean | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [courseName, setCourseName] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setCourses(await listCourses());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const prof = await isProfessor();
      if (!alive) return;
      setProfessor(prof);
      if (prof) await reload().catch((err) => setError(err.message));
    })();
    return () => {
      alive = false;
    };
  }, [reload]);

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !courseName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createCourse(courseName);
      setCourseName("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the course");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {brand.product.name}
        </p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Teach</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Create a course, share its join code with your students, and post assignments. You can
          review each student's packet questions before they print, and follow their progress
          through the paper.
        </p>
      </div>

      {professor === null && <Skeleton className="h-32 w-full rounded-xl" />}

      {professor === false && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          This area is for professors. If you teach a course and want access, contact support — the
          professor role is granted manually.
        </div>
      )}

      {professor && (
        <>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <form
            onSubmit={handleCreateCourse}
            className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:p-5"
          >
            <input
              type="text"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Course name (e.g. SOC 201 — Research Methods)"
              aria-label="New course name"
              className="min-h-11 w-full rounded-md border border-input bg-background/60 px-3.5 text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
            />
            <button
              type="submit"
              disabled={busy || courseName.trim() === ""}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              Create course
            </button>
          </form>

          {courses.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No courses yet — create your first one above.
            </p>
          )}

          {courses.map((course) => (
            <CourseSection key={course.id} course={course} onError={setError} />
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CourseSection({
  course,
  onError,
}: {
  course: Course;
  onError: (message: string | null) => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rosterCount, setRosterCount] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [followup, setFollowup] = useState<"allowed" | "required" | "off">("allowed");
  const [reviewFirst, setReviewFirst] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [a, roster] = await Promise.all([listAssignments(course.id), listRoster(course.id)]);
    setAssignments(a);
    setRosterCount(roster.length);
  }, [course.id]);

  useEffect(() => {
    reload().catch((err) => onError(err.message));
  }, [reload, onError]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !title.trim() || !topic.trim()) return;
    setBusy(true);
    onError(null);
    try {
      await createAssignment({
        courseId: course.id,
        title,
        topic,
        config: { followup, review_before_print: reviewFirst },
      });
      setTitle("");
      setTopic("");
      setShowForm(false);
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the assignment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words font-serif text-2xl">{course.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {rosterCount === null
              ? "…"
              : `${rosterCount} student${rosterCount === 1 ? "" : "s"} enrolled`}
          </p>
        </div>
        <div className="rounded-md border border-border bg-background px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Join code</p>
          <p className="font-mono text-lg tracking-[0.2em]">{course.join_code}</p>
        </div>
      </div>

      {assignments.map((a) => (
        <AssignmentSection key={a.id} assignment={a} onDeleted={reload} onError={onError} />
      ))}

      {showForm ? (
        <form
          onSubmit={handleCreate}
          className="space-y-3 rounded-md border border-border/60 p-3 sm:p-4"
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Assignment title (what students see)"
            aria-label="Assignment title"
            className="min-h-11 w-full rounded-md border border-input bg-background/60 px-3.5 text-base outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Research topic — what each student's packet will research"
            aria-label="Research topic"
            rows={2}
            className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-2.5 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Follow-up research:</span>
              <select
                value={followup}
                onChange={(e) => setFollowup(e.target.value as typeof followup)}
                className="min-h-11 rounded-md border border-input bg-background/60 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <option value="allowed">Student's choice</option>
                <option value="required">Required</option>
                <option value="off">Not used</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reviewFirst}
                onChange={(e) => setReviewFirst(e.target.checked)}
                className="h-4 w-4"
              />
              I want to review questions before students print
            </label>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={busy || !title.trim() || !topic.trim()}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Post assignment"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          + New assignment
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------

type StudentProgress = {
  piece: AssignmentPiece;
  packet: Packet | null;
  packetReturn: PacketReturn | null;
};

function progressLabel(p: StudentProgress): string {
  if (p.packetReturn?.status === "verified") return "Confirmed their returned work";
  if (p.packetReturn) return "Returning work";
  if (p.packet?.status === "reviewed") return "Printed — working on paper";
  if (p.packet) return "Reviewing packet questions";
  return "Researching";
}

function AssignmentSection({
  assignment,
  onDeleted,
  onError,
}: {
  assignment: Assignment;
  onDeleted: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<StudentProgress[] | null>(null);

  useEffect(() => {
    if (!open || progress) return;
    let alive = true;
    (async () => {
      try {
        const pieces = await listAssignmentPieces(assignment.id);
        const rows: StudentProgress[] = [];
        for (const piece of pieces) {
          const packets = await listPacketsByPieceId(piece.id);
          const packet = packets[0] ?? null;
          const returns = await listReturnsForPackets(packets.map((p) => p.id));
          rows.push({
            piece,
            packet,
            packetReturn: returns.find((r) => r.status === "verified") ?? returns[0] ?? null,
          });
        }
        if (alive) setProgress(rows);
      } catch (err) {
        if (alive) onError(err instanceof Error ? err.message : "Could not load progress");
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, progress, assignment.id, onError]);

  return (
    <div className="rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-4"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{assignment.title}</span>
          <span className="block truncate text-xs text-muted-foreground">{assignment.topic}</span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-3 py-3 sm:px-4">
          {progress === null && <Skeleton className="h-10 w-full rounded-md" />}
          {progress !== null && progress.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No students have started this assignment yet.
            </p>
          )}
          {progress !== null && progress.length > 0 && (
            <ul className="space-y-2">
              {progress.map((p) => (
                <li
                  key={p.piece.id}
                  className="flex flex-col gap-2 rounded-md border border-border/60 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {p.piece.title ?? "Untitled project"}
                    </span>
                    <span className="block text-xs text-muted-foreground">{progressLabel(p)}</span>
                  </span>
                  {p.packet && (
                    <Link
                      to="/packet/$runId"
                      params={{ runId: p.packet.run_id }}
                      className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
                    >
                      Review questions →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              deleteAssignment(assignment.id)
                .then(onDeleted)
                .catch((err) => onError(err.message));
            }}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/60 sm:min-h-9"
          >
            Delete assignment
          </button>
        </div>
      )}
    </div>
  );
}
