import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildComposePrompt, buildRevisionPrompt, slugify } from "../_shared/prompt.ts";

Deno.test("compose prompt carries voice, research, goal, and output paths", () => {
  const p = buildComposePrompt({
    pieceSlug: "test-piece-abc123",
    research: "Some research with a link https://example.com/a",
    goal: "Readers stop hand-rolling retries",
    styleText: "Short declaratives. No filler.",
  });
  assert(p.includes("contract/SKILL.md"));
  assert(p.includes("pieces/test-piece-abc123/proposal.md"));
  assert(p.includes("Short declaratives. No filler."));
  assert(p.includes("https://example.com/a"));
  assert(p.includes("Readers stop hand-rolling retries"));
  assert(p.includes("Do NOT open a pull request"));
});

Deno.test("revision prompt points at markup protocol and final.md", () => {
  const p = buildRevisionPrompt({
    pieceSlug: "test-piece-abc123",
    draftPath: "pieces/test-piece-abc123/draft.md",
    transcript: "S2P1: tighten to one sentence. Mark three: cut.",
    styleText: "Short declaratives.",
  });
  assert(p.includes("contract/references/MARKUP.md"));
  assert(p.includes("pieces/test-piece-abc123/final.md"));
  assert(p.includes("S2P1: tighten to one sentence"));
});

Deno.test("slugify produces url-safe, bounded, non-empty slugs", () => {
  assertEquals(slugify("Hello, World! This is a Test"), "hello-world-this-is-a-test");
  assertEquals(slugify("???"), "piece");
  assert(slugify("x".repeat(200)).length <= 48);
});
