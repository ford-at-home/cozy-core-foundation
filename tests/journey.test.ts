// The clarity layer's stage model: derived from domain data, never stored.
// These tests pin the derivation so UI copy and progress can't drift from
// what actually happened in the workflow.

import { describe, expect, it } from "vitest";
import {
  JOURNEY_STAGE_ORDER,
  deriveJourney,
  projectStageLabel,
  runActivityLabel,
  runKindLabel,
  runStatusLabel,
  type JourneyInput,
} from "@/lib/journey";

const BASE: JourneyInput = {
  packetRuns: [],
  packet: null,
  packetReturn: null,
  hasReturnedWork: false,
  followup: { state: "none" },
  artifacts: { document: false, presentation: false },
};

describe("deriveJourney", () => {
  it("starts at research with everything upcoming", () => {
    const { stages, currentStage } = deriveJourney(BASE);
    expect(currentStage).toBe("research");
    expect(stages.map((s) => s.id)).toEqual(JOURNEY_STAGE_ORDER);
    expect(stages[0].state).toBe("current");
    expect(stages.slice(1).every((s) => s.state === "upcoming")).toBe(true);
  });

  it("a generated packet moves the journey to print", () => {
    const { currentStage } = deriveJourney({
      ...BASE,
      packet: { id: "p1", status: "generated", version: 1 },
    });
    expect(currentStage).toBe("print");
  });

  it("an approved packet moves to paper work", () => {
    const { currentStage } = deriveJourney({
      ...BASE,
      packet: { id: "p1", status: "reviewed", version: 1 },
    });
    expect(currentStage).toBe("paper");
  });

  it("returned work moves to review; verification moves to follow-up", () => {
    const returned = deriveJourney({
      ...BASE,
      packet: { id: "p1", status: "reviewed", version: 1 },
      packetReturn: { status: "collecting" },
      hasReturnedWork: true,
    });
    expect(returned.currentStage).toBe("review");

    const verified = deriveJourney({
      ...BASE,
      packet: { id: "p1", status: "reviewed", version: 1 },
      packetReturn: { status: "verified" },
      hasReturnedWork: true,
    });
    expect(verified.currentStage).toBe("refine");
  });

  it("skipping follow-up is a completed decision, not a gap", () => {
    const { currentStage, stages } = deriveJourney({
      ...BASE,
      packet: { id: "p1", status: "reviewed", version: 1 },
      packetReturn: { status: "verified" },
      hasReturnedWork: true,
      followup: { state: "skipped" },
    });
    expect(currentStage).toBe("finish");
    expect(stages.find((s) => s.id === "refine")?.state).toBe("done");
  });

  it("an artifact completes the journey", () => {
    const { stages } = deriveJourney({
      ...BASE,
      packet: { id: "p1", status: "reviewed", version: 1 },
      packetReturn: { status: "verified" },
      hasReturnedWork: true,
      followup: { state: "done" },
      artifacts: { document: true, presentation: false },
    });
    expect(stages.every((s) => s.state === "done")).toBe(true);
  });
});

describe("plain-language labels", () => {
  it("never leaks machine statuses on primary surfaces", () => {
    expect(runStatusLabel("awaiting_fetch")).toBe("Almost done");
    expect(runStatusLabel("dispatch_unknown")).toBe("Confirming start");
    expect(runStatusLabel("failed")).toBe("Didn't finish");
  });

  it("describes activity by kind, not by status word", () => {
    expect(runActivityLabel("research", "running")).toBe("Gathering sources");
    expect(runActivityLabel("packet", "awaiting_fetch")).toBe("Building your packet");
    expect(runActivityLabel("followup_research", "queued")).toBe("Researching your questions");
    expect(runActivityLabel("document", "running")).toBe("Preparing your final paper");
    // Terminal statuses fall back to the status label.
    expect(runActivityLabel("packet", "completed")).toBe("Done");
  });

  it("names run kinds in user language", () => {
    expect(runKindLabel("packet")).toBe("Research packet");
    expect(runKindLabel("followup_research")).toBe("Follow-up research");
    expect(runKindLabel("document")).toBe("Final paper");
    expect(runKindLabel("presentation")).toBe("Presentation");
  });

  it("labels project stages per workflow", () => {
    expect(projectStageLabel("research_packet", "drafted")).toBe("Packet ready — review and print");
    expect(projectStageLabel("longform", "drafted")).toBe("Final draft ready");
    expect(projectStageLabel("longform", "proposed")).toBe("Proposal ready for your review");
  });
});
