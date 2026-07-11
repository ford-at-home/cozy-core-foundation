import { assert, assertEquals } from "jsr:@std/assert@1";
import { hmacSha256Hex, verifyWebhookSignature } from "../_shared/webhook.ts";

const SECRET = "test-webhook-secret-at-least-32-chars!!";
const body = new TextEncoder().encode(
  JSON.stringify({ event: "statusChange", id: "bc_abc", status: "FINISHED" }),
);

Deno.test("accepts a correctly signed payload", async () => {
  const sig = `sha256=${await hmacSha256Hex(SECRET, body)}`;
  assert(await verifyWebhookSignature(SECRET, body, sig));
});

Deno.test("rejects a tampered payload", async () => {
  const sig = `sha256=${await hmacSha256Hex(SECRET, body)}`;
  const tampered = new TextEncoder().encode(
    JSON.stringify({ event: "statusChange", id: "bc_abc", status: "ERROR" }),
  );
  assertEquals(await verifyWebhookSignature(SECRET, tampered, sig), false);
});

Deno.test("rejects wrong secret, missing and malformed headers", async () => {
  const sig = `sha256=${await hmacSha256Hex("some-other-secret-32-chars-long!!!", body)}`;
  assertEquals(await verifyWebhookSignature(SECRET, body, sig), false);
  assertEquals(await verifyWebhookSignature(SECRET, body, null), false);
  assertEquals(await verifyWebhookSignature(SECRET, body, "sha256=zzz"), false);
});
