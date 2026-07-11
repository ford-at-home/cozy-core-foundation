// HMAC-scoped bearer token for the agent's image-gen requests. Ties one
// token to one runId so a leaked token can only spend on that run.

export const IMAGE_ENDPOINT_PATH = "/api/public/generate-image";

export interface ImageCreds {
  endpoint: string;
  token: string;
}

export async function buildImageCreds(runId: string): Promise<ImageCreds | null> {
  const base = Deno.env.get("APP_PUBLIC_URL")?.trim();
  const secret = Deno.env.get("AGENT_IMAGE_SECRET")?.trim();
  if (!base || !secret) return null;
  const sig = await hmacHex(secret, runId);
  return {
    endpoint: `${base.replace(/\/$/, "")}${IMAGE_ENDPOINT_PATH}`,
    token: `${runId}.${sig}`,
  };
}

export async function verifyImageToken(token: string): Promise<string | null> {
  const secret = Deno.env.get("AGENT_IMAGE_SECRET")?.trim();
  if (!secret) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const runId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(secret, runId);
  return timingSafeEqual(sig, expected) ? runId : null;
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}