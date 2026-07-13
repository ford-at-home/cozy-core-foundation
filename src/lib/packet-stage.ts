// Authoritative user-facing stage model for the research-packet workflow.
//
// One pure derivation from server-persisted rows (agent_runs, packets,
// packet_returns, followup_questions, final_artifacts) — no component infers
// stage on its own. The project hub (/project/$pieceId) renders this; every
// stage's primary action links to the surface that does the work.
//
// Stages (docs/research-workflow/): Research → Print → Think → Return →
// Review → Follow Up → Finish. "Think" is the on-paper stage: nothing
// happens in the app until the student starts a return.

export const PACKET_STAGES = [
  "research",
  "print",
  "think",
  "return",
  "review",
  "follow_up",
  "finish",
] as const;
export type PacketStageKey = (typeof PACKET_STAGES)[number];

export const STAGE_LABELS: Record<PacketStageKey, string> = {
  research: "Research",
  print: "Print",
  think: "Think",
  return: "Return",
  review: "Review",
  follow_up: "Follow up",
  finish: "Finish",
};

/** One-sentence, plain-language explanation of what each stage IS.
 *  Used by the stepper description and hub cards so users always know
 *  what the current stage means without having to reason from the label. */
export const STAGE_DESCRIPTIONS: Record<PacketStageKey, string> = {
  research:
    "AI gathers sources and prepares your working packet — findings and questions written for what it found.",
  print: "Review the tailored questions, then print a clean hardcopy with anchors on every block.",
  think:
    "Off-screen, on paper. Read, annotate, answer, and note up to three follow-up research questions of your own.",
  return:
    "Bring your work back: photograph the pages, dictate your notes, or both. You can leave and come back.",
  review:
    "Confirm what the system read from your handwriting. Only your approved words move forward.",
  follow_up: "Optional. Approve up to three questions for a focused second research pass.",
  finish:
    "Create your final Word document and (optionally) a class presentation — from the research and your verified contributions.",
};

// -----------------------------------------------------------------------
// Shared vocabulary across BOTH workflows.
//
// The draft (longform) workflow maps its internal run/kind states onto the
// same six user-facing verbs, so a user who does both flows never learns two
// vocabularies. This is presentation-only — no orchestration changes.
// -----------------------------------------------------------------------

/** The six-verb spine both workflows share. Packet adds Review + Follow up. */
export const SHARED_STAGES = ["explore", "print", "think", "return", "refine", "finish"] as const;
export type SharedStageKey = (typeof SHARED_STAGES)[number];

export const SHARED_STAGE_LABELS: Record<SharedStageKey, string> = {
  explore: "Explore",
  print: "Print",
  think: "Think",
  return: "Return",
  refine: "Refine",
  finish: "Finish",
};

/** Map a packet-workflow stage to the shared vocabulary. */
export function packetStageToShared(stage: PacketStageKey): SharedStageKey {
  switch (stage) {
    case "research":
      return "explore";
    case "print":
      return "print";
    case "think":
      return "think";
    case "return":
    case "review":
      return "return";
    case "follow_up":
      return "refine";
    case "finish":
      return "finish";
  }
}

/** Map a draft-workflow run kind + status to a shared verb, for the
 *  dashboard stage column. `runKind` is the latest run's kind; when the
 *  piece has no runs yet we default to Explore. */
export function draftRunToShared(
  runKind: string | null,
  runStatus: string | null,
  finalPrMerged: boolean,
): SharedStageKey {
  if (finalPrMerged) return "finish";
  const terminal = runStatus === "completed";
  switch (runKind) {
    case null:
      return "explore";
    case "research":
      return terminal ? "print" : "explore";
    case "proposal":
    case "compose":
    case "draft":
      return terminal ? "print" : "explore";
    case "revision":
      return terminal ? "finish" : "refine";
    default:
      return "explore";
  }
}

/** Row-level input for the dashboard stage helper. */
export type DashboardStageInput = {
  workflow: "longform" | "research_packet" | string;
  latestRun: { kind: string; status: string } | null;
  packetView: PacketWorkflowView | null;
  finalPrMerged: boolean;
};

/** Give the dashboard a single shared verb per row, regardless of workflow. */
export function deriveDashboardStage(input: DashboardStageInput): {
  key: SharedStageKey;
  label: string;
} {
  const key: SharedStageKey =
    input.workflow === "research_packet" && input.packetView
      ? packetStageToShared(input.packetView.current)
      : draftRunToShared(
          input.latestRun?.kind ?? null,
          input.latestRun?.status ?? null,
          input.finalPrMerged,
        );
  return { key, label: SHARED_STAGE_LABELS[key] };
}

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "cancelled"]);

export type StageRun = {
  id: string;
  kind: string;
  status: string;
  created_at: string;
};

export type StagePacket = {
  id: string;
  run_id: string;
  version: number;
  status: "generated" | "reviewed";
};

export type StageReturn = {
  id: string;
  /** Derived UI status (deriveReturnUiStatus in src/lib/packet-workflow.ts),
   *  not the raw packet_returns.status upload-lifecycle value. */
  status: "collecting" | "recognizing" | "needs_review" | "verified" | "failed";
  created_at: string;
};

export type StageFollowup = {
  id: string;
  position: number;
  status: "submitted" | "refined" | "approved" | "researched";
};

export type StageArtifact = {
  id: string;
  kind: "docx" | "pptx";
  status: "pending" | "generating" | "ready" | "failed";
  created_at: string;
};

export type StageInputs = {
  runs: StageRun[];
  /** All packet versions for the piece, any order. */
  packets: StagePacket[];
  returns: StageReturn[];
  followups: StageFollowup[];
  artifacts: StageArtifact[];
};

export type StageState = "complete" | "current" | "upcoming";

export type PacketStageView = {
  key: PacketStageKey;
  label: string;
  state: StageState;
  /** Follow-up research is skippable; Finish is reachable without it. */
  optional: boolean;
};

export type PacketWorkflowView = {
  stages: PacketStageView[];
  current: PacketStageKey;
  /** Latest packet version (v1 unless follow-up research produced v2+). */
  packet: StagePacket | null;
  /** Most recent return attempt, if any. */
  latestReturn: StageReturn | null;
  /** Non-terminal generation run feeding the current stage, if any. */
  activeRun: StageRun | null;
  /** Most recent failed run when nothing newer succeeded or is running. */
  failedRun: StageRun | null;
  followupsResearched: boolean;
  followupResearchActive: boolean;
  docx: StageArtifact | null;
  pptx: StageArtifact | null;
};

function newestFirst<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function latestArtifact(artifacts: StageArtifact[], kind: "docx" | "pptx"): StageArtifact | null {
  return newestFirst(artifacts.filter((a) => a.kind === kind))[0] ?? null;
}

/** Derive the workflow view for one research-packet piece. */
export function derivePacketWorkflow(inputs: StageInputs): PacketWorkflowView {
  const packet = [...inputs.packets].sort((a, b) => b.version - a.version)[0] ?? null;
  const latestReturn = newestFirst(inputs.returns)[0] ?? null;
  const runs = newestFirst(inputs.runs);

  const generationKinds = new Set(["research", "packet", "proposal"]);
  const activeGeneration =
    runs.find((r) => generationKinds.has(r.kind) && !TERMINAL_RUN_STATUSES.has(r.status)) ?? null;
  const failedGeneration =
    !packet && !activeGeneration
      ? (runs.find((r) => generationKinds.has(r.kind) && r.status === "failed") ?? null)
      : null;

  const followupResearchActive = runs.some(
    (r) => r.kind === "followup_research" && !TERMINAL_RUN_STATUSES.has(r.status),
  );
  const followupsResearched =
    inputs.followups.some((f) => f.status === "researched") ||
    (packet !== null && packet.version > 1);

  const docx = latestArtifact(inputs.artifacts, "docx");
  const pptx = latestArtifact(inputs.artifacts, "pptx");

  // Completion is monotonic per stage; the current stage is the first
  // incomplete one, except Follow Up (optional) which yields to Finish once
  // an artifact exists.
  const researchDone = packet !== null;
  // The print loop is done once any packet version was reviewed; a v2 packet
  // (follow-up research output) implies the v1 loop finished on paper.
  const printDone =
    inputs.packets.some((p) => p.status === "reviewed") || (packet !== null && packet.version > 1);
  const thinkDone = latestReturn !== null;
  const returnDone =
    latestReturn !== null && ["needs_review", "verified"].includes(latestReturn.status);
  const reviewDone = latestReturn !== null && latestReturn.status === "verified";
  const followUpDone = followupsResearched;
  const finishDone = docx !== null && docx.status === "ready";

  let current: PacketStageKey;
  if (!researchDone) current = "research";
  else if (!printDone) current = "print";
  else if (!thinkDone) current = "think";
  else if (!returnDone) current = "return";
  else if (!reviewDone) current = "review";
  else if (!followUpDone && !finishDone && !docx) current = "follow_up";
  else current = "finish";

  const done: Record<PacketStageKey, boolean> = {
    research: researchDone,
    print: printDone,
    think: thinkDone,
    return: returnDone,
    review: reviewDone,
    follow_up: followUpDone,
    finish: finishDone,
  };

  const stages: PacketStageView[] = PACKET_STAGES.map((key) => ({
    key,
    label: STAGE_LABELS[key],
    optional: key === "follow_up",
    state: key === current ? "current" : done[key] ? "complete" : "upcoming",
  }));

  return {
    stages,
    current,
    packet,
    latestReturn,
    activeRun: activeGeneration,
    failedRun: failedGeneration,
    followupsResearched,
    followupResearchActive,
    docx,
    pptx,
  };
}
