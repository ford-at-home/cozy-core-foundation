// Public image-gen endpoint the agent calls to produce raster images for a
// piece. Auth is a per-run HMAC bearer token minted at dispatch time (see
// supabase/functions/_shared/image-token.ts). Lovable AI Gateway is the
// primary generator; direct OpenAI (with OPENAI_API_KEY) is the fallback.
//
// Returns raw PNG bytes with content-type image/png on success so the agent
// can pipe curl --output straight to a file. Errors return JSON.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return jsonError(401, "Missing bearer token");

        const runId = await verifyToken(token);
        if (!runId) return jsonError(401, "Invalid token");

        let body: { prompt?: unknown; style?: unknown; size?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          return jsonError(400, "Body must be JSON");
        }
        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) return jsonError(400, "prompt is required");
        if (prompt.length > 4000) return jsonError(400, "prompt too long (max 4000 chars)");
        const style = typeof body.style === "string" ? body.style.trim() : "";
        const size = typeof body.size === "string" && /^\d{3,4}x\d{3,4}$/.test(body.size)
          ? body.size
          : "1024x1024";
        const fullPrompt = style ? `${style}\n\nSubject: ${prompt}` : prompt;

        // Try Lovable AI Gateway first, then fall back to OpenAI direct.
        try {
          const png = await generateViaLovable(fullPrompt, size);
          if (png) return pngResponse(png, "lovable");
        } catch (err) {
          console.warn("Lovable image gen failed, trying OpenAI:", err);
        }
        try {
          const png = await generateViaOpenAI(fullPrompt, size);
          if (png) return pngResponse(png, "openai");
        } catch (err) {
          console.error("OpenAI image gen failed:", err);
          return jsonError(502, err instanceof Error ? err.message : "Image generation failed");
        }
        return jsonError(502, "No image provider available");
      },
    },
  },
});

function pngResponse(bytes: Uint8Array, source: string) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "no-store",
      "x-image-source": source,
    },
  });
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// -------- Providers ------------------------------------------------------

async function generateViaLovable(prompt: string, size: string): Promise<Uint8Array | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      prompt,
      size,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lovable ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) return null;
  return base64ToBytes(b64);
}

async function generateViaOpenAI(prompt: string, size: string): Promise<Uint8Array | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size,
      n: 1,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return base64ToBytes(b64);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// -------- Token verification (mirrors supabase/functions/_shared/image-token.ts)
async function verifyToken(token: string): Promise<string | null> {
  const secret = process.env.AGENT_IMAGE_SECRET?.trim();
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