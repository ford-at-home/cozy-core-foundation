// Stage derivation for the research-packet workflow hub. The derivation is
// the single authoritative mapping from persisted rows to the user-facing
// stages (Research → Print → Think → Return → Review → Follow Up → Finish);
// these tests pin the transitions the UI depends on.

import { describe, expect, it } from "vitest";
import {
  PACKET_STAGES,
  derivePacketWorkflow,
  type StageArtifact,
  type StageInputs,
  type StagePacket,
  type StageReturn,
  type StageRun,
} from "../src/lib/packet-stage";

const T0 = "2026-07-13T00:00:00Z";
const T1 = "2026-07-13T01:00:00Z";
const T2 = "2026-07-13T02:00:00Z";

function inputs(partial: Partial<StageInputs>): StageInputs {
  return { runs: [], packets: [], returns: [], followups: [], artifacts: [], ...partial };
}

const run = (over: Partial<StageRun>): StageRun => ({
  id: "r1",
  kind: "research",
  status: "running",
  created_at: T0,
  ...over,
});

const packet = (over: Partial<StagePacket> = {}): StagePacket => ({
  id: "p1",
  run_id: "r2",
  version: 1,
  status: "generated",
  ...over,
});

const ret = (over: Partial<StageReturn> = {}): StageReturn => ({
  id: "ret1",
  status: "collecting",
  created_at: T1,
  ...over,
});

const artifact = (over: Partial<StageArtifact> = {}): StageArtifact => ({
  id: "a1",
  kind: "docx",
  status: "ready",
  created_at: T2,
  ...over,
});

describe("derivePacketWorkflow", () => {
  it("exposes all seven stages in order", () => {
    const view = derivePacketWorkflow(inputs({}));
    expect(view.stages.map((s) => s.key)).toEqual([...PACKET_STAGES]);
  });

  it("starts in research while the research run is in flight", () => {
    const view = derivePacketWorkflow(inputs({ runs: [run({ status: "running" })] }));
    expect(view.current).toBe("research");
    expect(view.activeRun?.id).toBe("r1");
    expect(view.failedRun).toBeNull();
  });

  it("surfaces a failed research run as a recoverable state", () => {
    const view = derivePacketWorkflow(inputs({ runs: [run({ status: "failed" })] }));
    expect(view.current).toBe("research");
    expect(view.activeRun).toBeNull();
    expect(view.failedRun?.id).toBe("r1");
  });

  it("does not report failure when a newer run is active", () => {
    const view = derivePacketWorkflow(
      inputs({
        runs: [
          run({ id: "old", status: "failed", created_at: T0 }),
          run({ id: "new", status: "queued", created_at: T1 }),
        ],
      }),
    );
    expect(view.activeRun?.id).toBe("new");
    expect(view.failedRun).toBeNull();
  });

  it("moves to print once a packet exists, and to think once reviewed", () => {
    const generated = derivePacketWorkflow(inputs({ packets: [packet()] }));
    expect(generated.current).toBe("print");

    const reviewed = derivePacketWorkflow(inputs({ packets: [packet({ status: "reviewed" })] }));
    expect(reviewed.current).toBe("think");
    expect(reviewed.stages.find((s) => s.key === "print")?.state).toBe("complete");
  });

  it("moves to return when a return is collecting, review when recognized", () => {
    const base = { packets: [packet({ status: "reviewed" })] };
    const collecting = derivePacketWorkflow(inputs({ ...base, returns: [ret()] }));
    expect(collecting.current).toBe("return");

    const needsReview = derivePacketWorkflow(
      inputs({ ...base, returns: [ret({ status: "needs_review" })] }),
    );
    expect(needsReview.current).toBe("review");
  });

  it("moves to follow_up after verification, marked optional", () => {
    const view = derivePacketWorkflow(
      inputs({
        packets: [packet({ status: "reviewed" })],
        returns: [ret({ status: "verified" })],
      }),
    );
    expect(view.current).toBe("follow_up");
    expect(view.stages.find((s) => s.key === "follow_up")?.optional).toBe(true);
  });

  it("treats a v2 packet as follow-up research done", () => {
    const view = derivePacketWorkflow(
      inputs({
        packets: [
          packet({ id: "p1", version: 1, status: "reviewed" }),
          packet({ id: "p2", run_id: "r9", version: 2, status: "generated" }),
        ],
        returns: [ret({ status: "verified" })],
      }),
    );
    expect(view.followupsResearched).toBe(true);
    expect(view.current).toBe("finish");
    // Latest version wins as the packet in view.
    expect(view.packet?.version).toBe(2);
  });

  it("reaches finish once a docx artifact exists, even without follow-up", () => {
    const view = derivePacketWorkflow(
      inputs({
        packets: [packet({ status: "reviewed" })],
        returns: [ret({ status: "verified" })],
        artifacts: [artifact({ status: "generating" })],
      }),
    );
    expect(view.current).toBe("finish");
    expect(view.docx?.status).toBe("generating");
  });

  it("marks finish complete when the docx is ready", () => {
    const view = derivePacketWorkflow(
      inputs({
        packets: [packet({ status: "reviewed" })],
        returns: [ret({ status: "verified" })],
        artifacts: [artifact()],
      }),
    );
    expect(view.stages.find((s) => s.key === "finish")?.state).toBe("current");
    expect(view.docx?.status).toBe("ready");
  });

  it("uses the newest return attempt", () => {
    const view = derivePacketWorkflow(
      inputs({
        packets: [packet({ status: "reviewed" })],
        returns: [
          ret({ id: "old", status: "failed", created_at: T0 }),
          ret({ id: "new", status: "needs_review", created_at: T1 }),
        ],
      }),
    );
    expect(view.latestReturn?.id).toBe("new");
    expect(view.current).toBe("review");
  });

  it("flags an in-flight follow-up research run", () => {
    const view = derivePacketWorkflow(
      inputs({
        runs: [run({ id: "f1", kind: "followup_research", status: "running", created_at: T1 })],
        packets: [packet({ status: "reviewed" })],
        returns: [ret({ status: "verified" })],
      }),
    );
    expect(view.followupResearchActive).toBe(true);
    // Still the follow-up stage until the revised packet lands.
    expect(view.current).toBe("follow_up");
  });
});
