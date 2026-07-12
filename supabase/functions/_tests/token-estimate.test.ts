import { assertEquals } from "jsr:@std/assert@1";
import { estimateTokens, promptSummary } from "../_shared/token-estimate.ts";

Deno.test("estimateTokens uses ~4 chars per token", () => {
  assertEquals(estimateTokens(""), 0);
  assertEquals(estimateTokens("abcd"), 1);
  assertEquals(estimateTokens("abcde"), 2);
  assertEquals(estimateTokens("x".repeat(10000)), 2500);
});

Deno.test("promptSummary formats char and token counts", () => {
  assertEquals(promptSummary(10000), "dispatch prompt: 10,000 chars (~2,500 est. tokens)");
});
