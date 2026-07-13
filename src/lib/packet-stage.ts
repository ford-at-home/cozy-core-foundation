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
  status: "generating" | "ready" | "failed";
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
