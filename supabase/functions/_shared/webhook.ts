// Cursor statusChange webhook verification (docs/cursor-api-research.md):
// HMAC-SHA256 over the RAW request body, header `X-Webhook-Signature:
// sha256=<hex>`. Delivery is at-least-once and unordered; dedup happens in
// agent_run_events, ordering safety in the state machine's monotonic guard.

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, body as BufferSource);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyWebhookSignature(
  secret: string,
  rawBody: Uint8Array,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const expected = `sha256=${await hmacSha256Hex(secret, rawBody)}`;
  if (expected.length !== signatureHeader.length) return false;
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}
