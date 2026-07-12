import { assert, assertEquals } from "jsr:@std/assert@1";
import { canTransition, isTerminal, mapExternalStatus, RUN_STATES } from "../_shared/state.ts";
import { applyExternalStatus, type RunRow } from "../_shared/complete.ts";

function run(status: RunRow["status"]): RunRow {
  return { id: "r1", piece_id: "p1", status, kind: "proposal", branch: "b", input: {} };
}

Deno.test("external status mapping covers the documented enum", () => {
  assertEquals(mapExternalStatus("CREATING"), "queued");
  assertEquals(mapExternalStatus("RUNNING"), "running");
  assertEquals(mapExternalStatus("FINISHED"), "awaiting_fetch");
  assertEquals(mapExternalStatus("ERROR"), "failed");
});

Deno.test("unknown vendor status maps to a non-terminal hold (null)", () => {
  assertEquals(mapExternalStatus("EXPIRED"), null);
  assertEquals(mapExternalStatus("SOMETHING_NEW"), null);
});

Deno.test("happy path transitions are legal", () => {
  assert(canTransition("requested", "dispatching"));
  assert(canTransition("dispatching", "queued"));
  assert(canTransition("queued", "running"));
  assert(canTransition("running", "awaiting_fetch"));
  assert(canTransition("awaiting_fetch", "completed"));
});

Deno.test("terminal states admit no transitions", () => {
  for (const from of ["completed", "failed", "cancelled"] as const) {
    assert(isTerminal(from));
    for (const to of RUN_STATES) {
      assertEquals(canTransition(from, to), false, `${from} -> ${to} must be illegal`);
    }
  }
});

Deno.test("dispatch ambiguity resolves forward or releases backward", () => {
  assert(canTransition("dispatching", "dispatch_unknown"));
  assert(canTransition("dispatch_unknown", "running"));
  assert(canTransition("dispatch_unknown", "requested"));
});

Deno.test("out-of-order webhook cannot regress a completed run", () => {
  // FINISHED then RUNNING delivered out of order: second event is a no-op.
  assertEquals(applyExternalStatus(run("awaiting_fetch"), "RUNNING"), null);
  assertEquals(applyExternalStatus(run("completed"), "RUNNING"), null);
});

Deno.test("applyExternalStatus applies legal moves and holds unknowns", () => {
  assertEquals(applyExternalStatus(run("queued"), "RUNNING"), { status: "running" });
  assertEquals(applyExternalStatus(run("running"), "FINISHED"), { status: "awaiting_fetch" });
  assertEquals(applyExternalStatus(run("running"), "SOME_FUTURE_STATE"), null);
  const failed = applyExternalStatus(run("running"), "ERROR");
  assertEquals(failed?.status, "failed");
});

Deno.test("same-status event is a no-op", () => {
  assertEquals(applyExternalStatus(run("running"), "RUNNING"), null);
});
