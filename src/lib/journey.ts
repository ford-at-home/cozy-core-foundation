// The research-packet journey: one client-side stage model derived from
// domain data (no new state columns to drift). This is the single source of
// the user-facing stage names, descriptions, and ordering used by the
// project hub and the dashboard.
//
// Stages (docs/research-workflow/README.md, simplified for the UI):
//   Research → Print → Work on paper → Return → Review → Follow up (optional) → Finish
//
// Each stage answers: where am I, what is happening, what do I do next.

import type { RunStatus } from "@/lib/workflows.functions";

export type JourneyStageId =
  "research" | "print" | "paper" | "return" | "review" | "refine" | "finish";

export type StageState = "done" | "current" | "upcoming";

export type JourneyStage = {
  id: JourneyStageId;
  /** Short name for navigation and progress indicators. */
  label: string;
  /** One sentence, plain language. */
  description: string;
  state: StageState;
};

export type JourneyInput = {
  /** The packet-generation (or revised-packet) runs, newest first. */
  packetRuns: Array<{ id: string; status: RunStatus }>;
  /** Newest packet version, if persisted. */
  packet: { id: string; status: "generated" | "reviewed"; version: number } | null;
  /** The packet's return, if opened. */
  packetReturn: { status: "collecting" | "verified" } | null;
  /** Whether any returned material exists (pages or dictation). */
  hasReturnedWork: boolean;
  /** Follow-up research state (Phase 5). */
  followup: { state: "none" | "running" | "done" | "skipped" };
  /** Final outputs (Phase 6–7). */
  artifacts: { document: boolean; presentation: boolean };
};

const STAGE_META: Record<JourneyStageId, { label: string; description: string }> = {
  research: {
    label: "Research",
    description: "We research the subject and build your packet.",
  },
  print: {
    label: "Print",
    description: "Review the questions, then print your packet.",
  },
  paper: {
    label: "Work on paper",
    description: "Read, annotate, and answer by hand — at your own pace.",
  },
  return: {
    label: "Return",
    description: "Photograph your pages, dictate your answers, or both.",
  },
  review: {
    label: "Review",
    description: "Check what we read from your handwriting before it's used.",
  },
  refine: {
    label: "Follow up",
    description: "Optional: pick up to three questions for a focused second research pass.",
  },
  finish: {
    label: "Finish",
    description: "Create your final paper and class presentation.",
  },
};

export const JOURNEY_STAGE_ORDER: JourneyStageId[] = [
  "research",
  "print",
  "paper",
  "return",
  "review",
  "refine",
  "finish",
];

/**
 * Derive the journey from domain data. The current stage is the first
 * incomplete one; everything after it is upcoming.
 */
export function deriveJourney(input: JourneyInput): {
  stages: JourneyStage[];
  currentStage: JourneyStageId;
} {
  const packetGenerated = input.packet !== null;
  const packetApproved = input.packet?.status === "reviewed";
  const returned = input.hasReturnedWork;
  const verified = input.packetReturn?.status === "verified";
  const followupResolved = input.followup.state === "done" || input.followup.state === "skipped";
  const finished = input.artifacts.document || input.artifacts.presentation;

  // Completion condition per stage, in order.
  const doneById: Record<JourneyStageId, boolean> = {
    research: packetGenerated,
    print: packetApproved,
    // Paper work happens off screen; returning any work implies it happened.
    paper: returned,
    return: returned,
    review: verified,
    refine: verified && followupResolved,
    finish: finished,
  };

  let currentAssigned = false;
  const stages: JourneyStage[] = JOURNEY_STAGE_ORDER.map((id) => {
    let state: StageState;
    if (doneById[id] && !currentAssigned) {
      state = "done";
    } else if (!currentAssigned) {
      state = "current";
      currentAssigned = true;
    } else {
      state = "upcoming";
    }
    return { id, ...STAGE_META[id], state };
  });

  const current = stages.find((s) => s.state === "current")?.id ?? "finish";
  return { stages, currentStage: current };
}

// ---------------------------------------------------------------------------
// Plain-language status labels for runs (used wherever a machine status would
// otherwise leak). The raw status remains visible in the run detail timeline.

const RUN_STATUS_LABELS: Record<string, string> = {
  requested: "Starting",
  dispatching: "Starting",
  dispatch_unknown: "Confirming start",
  queued: "Waiting to start",
  running: "Working",
  awaiting_fetch: "Almost done",
  completed: "Done",
  failed: "Didn't finish",
  cancel_requested: "Stopping",
  cancelled: "Stopped",
};

export function runStatusLabel(status: string): string {
  return RUN_STATUS_LABELS[status] ?? status;
}

/** Kind-aware in-progress labels ("Gathering sources", not "running"). */
export function runActivityLabel(kind: string, status: string): string {
  const active = [
    "requested",
    "dispatching",
    "dispatch_unknown",
    "queued",
    "running",
    "awaiting_fetch",
  ];
  if (!active.includes(status)) return runStatusLabel(status);
  switch (kind) {
    case "research":
      return "Gathering sources";
    case "followup_research":
      return "Researching your questions";
    case "packet":
      return "Building your packet";
    case "document":
      return "Preparing your final paper";
    case "presentation":
      return "Creating your presentation";
    case "draft":
      return "Preparing the final draft";
    case "revision":
      return "Applying your annotations";
    default:
      return "Preparing the draft";
  }
}

/** Human names for run kinds (dashboard Type column, session lists). */
const RUN_KIND_LABELS: Record<string, string> = {
  research: "Research",
  proposal: "Draft proposal",
  resynth: "New proposal",
  draft: "Final draft",
  revision: "Revision",
  packet: "Research packet",
  followup_research: "Follow-up research",
  document: "Final paper",
  presentation: "Presentation",
};

export function runKindLabel(kind: string): string {
  return RUN_KIND_LABELS[kind] ?? kind;
}
