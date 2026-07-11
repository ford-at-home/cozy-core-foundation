// Edge function: start-workflow — thin, fast, IDEMPOTENT dispatch adapter.
//
// Contract (plan v2 §flows):
//   - Requires an authenticated user (Supabase JWT).
//   - Body: { research, goal?, requestId? } — safe inputs only. Repo, ref,
//     model, prompt, and voice are resolved server-side. Never accepted
//     from the browser.
//   - Voice = caller's profiles.style_text. Empty voice -> 422 (the contract
//     refuses to run without a voice; no silent fallback).
//   - Inserts pieces + agent_runs rows (insert BEFORE dispatch), dispatches
//     to the agent provider, returns 202 { runId, pieceId } immediately.
//   - Idempotent on requestId: a retried submission returns the existing run.
//   - Dispatch ambiguity (timeout / crash between create and persist) lands
//     in status 'dispatch_unknown'; the reconciler resolves it. NEVER
//     blind-retry the create — Cursor has no idempotency key.
//
// This function must never hold the run open and must never place any
// Supabase/GitHub secret in the agent environment.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildComposePrompt, slugify } from "../_shared/prompt.ts";
import { dispatchRun, resolveProvider } from "../_shared/dispatch.ts";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: "Server misconfigured" }, 500);
  }

  // --- 1. Authenticate the caller -----------------------------------------
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  // --- 2. Validate safe inputs ---------------------------------------------
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const research = typeof body?.research === "string" ? body.research.trim() : "";
  const goal = typeof body?.goal === "string" ? body.goal.trim() : "";
  const requestId = typeof body?.requestId === "string" && body.requestId
    ? body.requestId
    : crypto.randomUUID();
  const rawAttachments = Array.isArray(body?.attachments) ? body.attachments : [];
  if (!research && rawAttachments.length === 0) {
    return json({ error: "research or at least one attachment is required" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- 3. Idempotency: an existing run for this requestId wins -------------
  const idempotencyKey = `compose:${userId}:${requestId}`;
  {
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id, piece_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId: existing.piece_id }, 202);
  }

  // --- 4. Resolve voice from the caller's profile (server-side only) -------
  const { data: profile } = await admin
    .from("profiles")
    .select("style_text, image_style")
    .eq("user_id", userId)
    .maybeSingle();
  const styleText = (profile?.style_text ?? "").trim();
  const imageStyle = (profile?.image_style ?? "").trim();
  if (!styleText) {
    return json(
      { error: "Your voice profile is empty. Describe your style at /profile first." },
      422,
    );
  }

  // --- 5. Insert piece + run BEFORE dispatching -----------------------------
  const slug = `${slugify(goal || research.slice(0, 60))}-${crypto.randomUUID().slice(0, 6)}`;
  const { data: piece, error: pieceErr } = await admin
    .from("pieces")
    .insert({ user_id: userId, slug, title: goal || null, stage: "research" })
    .select("id")
    .single();
  if (pieceErr || !piece) return json({ error: pieceErr?.message ?? "Insert failed" }, 500);

  const { data: inserted, error: insertErr } = await admin
    .from("agent_runs")
    .insert({
      user_id: userId,
      piece_id: piece.id,
      kind: "proposal",
      status: "dispatching",
      idempotency_key: idempotencyKey,
      // style_text deliberately NOT stored here (sensitive profile data).
      input: { research, goal: goal || null },
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    // Unique violation = a concurrent retry won the race; return its run.
    const { data: existing } = await admin
      .from("agent_runs")
      .select("id, piece_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ runId: existing.id, pieceId: existing.piece_id }, 202);
    return json({ error: insertErr?.message ?? "Insert failed" }, 500);
  }
  const runId = inserted.id as string;

  // Per-run image-gen credentials for the agent to call our public route.
  const imageCreds = buildImageCreds(runId);

  // --- 5b. Materialize attachments: inline text, sign URLs for binaries ----
  const attachments = await resolveAttachments(admin, userId, rawAttachments);

  // --- 6. Dispatch ----------------------------------------------------------
  await dispatchRun({
    admin,
    provider: resolveProvider(),
    runId,
    prompt: buildComposePrompt({
      pieceSlug: slug,
      research,
      goal: goal || null,
      styleText,
      imageStyle,
      imageEndpoint: imageCreds?.endpoint,
      imageToken: imageCreds?.token,
      attachments,
    }),
    ref: Deno.env.get("AGENT_REPO_REF") ?? "main",
    autoCreatePr: false, // proposal runs push a branch only; PRs come later via "ready"
  });

  return json({ runId, pieceId: piece.id }, 202);
});

// Mints an HMAC-scoped image-gen bearer token bound to this run so a leaked
// token can only generate images for one run. Returns null if the endpoint
// isn't configured (falls back to legacy SVG rule).
function buildImageCreds(runId: string): { endpoint: string; token: string } | null {
  const base = Deno.env.get("APP_PUBLIC_URL")?.trim();
  const secret = Deno.env.get("AGENT_IMAGE_SECRET")?.trim();
  if (!base || !secret) return null;
  const token = `${runId}.${hmacHex(secret, runId)}`;
  return { endpoint: `${base.replace(/\/$/, "")}/api/public/generate-image`, token };
}

function hmacHex(secret: string, msg: string): string {
  const enc = new TextEncoder();
  // Sync HMAC via crypto.subtle is async; do it once at module load isn't
  // possible per-run, so we use a small sync helper via SubtleCrypto below.
  // Note: we intentionally use SHA-256 HMAC via a small sync-looking wrapper.
  // deno-lint-ignore no-explicit-any
  const key = (globalThis as any).crypto.subtle;
  // fall through to async signer
  return _hmacHexSync(secret, msg);
  // eslint-disable-next-line no-unreachable
  void enc; void key;
}

// Simple sync-ish HMAC-SHA256 using WebCrypto (awaited via top-level await
// inside the caller is impractical here — dispatch is not async in this path).
// We implement a compact HMAC-SHA256 in pure JS to keep prompt building sync.
function _hmacHexSync(secret: string, msg: string): string {
  const enc = new TextEncoder();
  const keyBytes = enc.encode(secret);
  const msgBytes = enc.encode(msg);
  const blockSize = 64;
  let k = keyBytes;
  if (k.length > blockSize) k = new Uint8Array(sha256(k));
  if (k.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(k);
    k = padded;
  }
  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = k[i] ^ 0x5c;
    iKeyPad[i] = k[i] ^ 0x36;
  }
  const inner = sha256(concat(iKeyPad, msgBytes));
  const outer = sha256(concat(oKeyPad, new Uint8Array(inner)));
  return [...new Uint8Array(outer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a); out.set(b, a.length);
  return out;
}
// Minimal SHA-256 (FIPS 180-4). Compact, ~1KB. Sufficient here — not perf critical.
function sha256(bytes: Uint8Array): ArrayBuffer {
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  const l = bytes.length;
  const withPad = new Uint8Array(((l + 9 + 63) >> 6) << 6);
  withPad.set(bytes);
  withPad[l] = 0x80;
  const bitLen = BigInt(l) * 8n;
  const dv = new DataView(withPad.buffer);
  dv.setBigUint64(withPad.length - 8, bitLen, false);
  const H = new Uint32Array([
    0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19,
  ]);
  const w = new Uint32Array(64);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = ror(w[t-15], 7) ^ ror(w[t-15], 18) ^ (w[t-15] >>> 3);
      const s1 = ror(w[t-2], 17) ^ ror(w[t-2], 19) ^ (w[t-2] >>> 10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = ror(e,6) ^ ror(e,11) ^ ror(e,25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = ror(a,2) ^ ror(a,13) ^ ror(a,22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]+a)>>>0; H[1] = (H[1]+b)>>>0; H[2] = (H[2]+c)>>>0; H[3] = (H[3]+d)>>>0;
    H[4] = (H[4]+e)>>>0; H[5] = (H[5]+f)>>>0; H[6] = (H[6]+g)>>>0; H[7] = (H[7]+h)>>>0;
  }
  const out = new ArrayBuffer(32);
  const odv = new DataView(out);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i], false);
  return out;
}
function ror(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

// Cap how much attachment text we inline into a single prompt to avoid
// blowing past provider limits. Non-text and oversized files fall back to
// signed URLs.
const INLINE_TEXT_MAX_BYTES = 200_000; // ~200 KB per file
const INLINE_TOTAL_MAX_BYTES = 500_000; // ~500 KB across all attachments
const TEXT_MIME_PREFIXES = ["text/"];
const TEXT_MIME_EXACT = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/typescript",
  "application/sql",
  "application/toml",
]);
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24; // 24h

function isTextLike(contentType: string | undefined, name: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (TEXT_MIME_PREFIXES.some((p) => ct.startsWith(p))) return true;
  if (TEXT_MIME_EXACT.has(ct)) return true;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return [
    "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml",
    "xml", "html", "htm", "log", "toml", "ini",
  ].includes(ext);
}

function isPdf(contentType: string | undefined, name: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct === "application/pdf" || ct === "application/x-pdf") return true;
  return name.toLowerCase().endsWith(".pdf");
}

async function extractPdfText(buf: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : String(text ?? "");
}

// OCR fallback for scanned PDFs. When pdf.js pulls almost no text out of a
// PDF (image-only scans, camera captures), we ask a vision model to
// transcribe it. Uses the Lovable AI Gateway so no extra provider secret
// is needed.
const OCR_MIN_CHARS = 200; // below this we treat extraction as "empty enough"
const OCR_MAX_PDF_BYTES = 15 * 1024 * 1024; // 15 MB — gateway/provider ceiling
const OCR_MODEL = "google/gemini-2.5-flash";
const OCR_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function ocrPdf(buf: Uint8Array, name: string): Promise<string> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return "";
  if (buf.length > OCR_MAX_PDF_BYTES) return "";
  const dataUrl = `data:application/pdf;base64,${bytesToBase64(buf)}`;
  const res = await fetch(OCR_GATEWAY_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OCR_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcribe ALL text from this PDF verbatim. Preserve reading order and paragraph breaks. " +
                "Do not summarize, translate, or add commentary. If a page is blank, write '[blank page]'.",
            },
            {
              type: "file",
              file: { filename: name, file_data: dataUrl },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return "";
  const json = await res.json().catch(() => null) as any;
  const text = json?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text : "";
}

function nonWhitespaceLength(s: string): number {
  return s.replace(/\s+/g, "").length;
}

async function resolveAttachments(
  admin: any,
  userId: string,
  raw: any[],
): Promise<Array<{
  name: string;
  contentType?: string;
  size?: number;
  text?: string;
  url?: string;
  truncated?: boolean;
}>> {
  const out: Array<any> = [];
  let inlinedTotal = 0;
  for (const item of raw.slice(0, 10)) {
    const path = typeof item?.path === "string" ? item.path : "";
    const name = typeof item?.name === "string" ? item.name : path.split("/").pop() ?? "file";
    const contentType = typeof item?.contentType === "string" ? item.contentType : undefined;
    const size = typeof item?.size === "number" ? item.size : undefined;
    if (!path) continue;
    // Ownership: path must live under the caller's own folder.
    const first = path.split("/")[0];
    if (first !== userId) continue;

    if (
      isTextLike(contentType, name) &&
      (size === undefined || size <= INLINE_TEXT_MAX_BYTES) &&
      inlinedTotal < INLINE_TOTAL_MAX_BYTES
    ) {
      try {
        const { data: blob, error: dlErr } = await admin.storage
          .from("research-attachments")
          .download(path);
        if (!dlErr && blob) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          const remaining = INLINE_TOTAL_MAX_BYTES - inlinedTotal;
          const slice = buf.slice(0, Math.min(INLINE_TEXT_MAX_BYTES, remaining));
          const truncated = buf.length > slice.length;
          const text = new TextDecoder("utf-8", { fatal: false }).decode(slice);
          inlinedTotal += slice.length;
          out.push({ name, contentType, size, text, truncated });
          continue;
        }
      } catch {
        // fall through to signed URL
      }
    }

    if (isPdf(contentType, name) && inlinedTotal < INLINE_TOTAL_MAX_BYTES) {
      try {
        const { data: blob, error: dlErr } = await admin.storage
          .from("research-attachments")
          .download(path);
        if (!dlErr && blob) {
          const buf = new Uint8Array(await blob.arrayBuffer());
          let full = "";
          try {
            full = await extractPdfText(buf);
          } catch {
            full = "";
          }
          let source: "pdf-text" | "pdf-ocr" = "pdf-text";
          if (nonWhitespaceLength(full) < OCR_MIN_CHARS) {
            const ocr = await ocrPdf(buf, name).catch(() => "");
            if (nonWhitespaceLength(ocr) > nonWhitespaceLength(full)) {
              full = ocr;
              source = "pdf-ocr";
            }
          }
          if (!full) throw new Error("empty");
          const remaining = INLINE_TOTAL_MAX_BYTES - inlinedTotal;
          const cap = Math.min(INLINE_TEXT_MAX_BYTES, remaining);
          const encoded = new TextEncoder().encode(full);
          const truncated = encoded.length > cap;
          const text = truncated
            ? new TextDecoder("utf-8", { fatal: false }).decode(encoded.slice(0, cap))
            : full;
          inlinedTotal += truncated ? cap : encoded.length;
          const prefix = source === "pdf-ocr"
            ? "[OCR transcription — original PDF had no embedded text layer]\n\n"
            : "";
          out.push({
            name,
            contentType: contentType ?? "application/pdf",
            size,
            text: prefix + text,
            truncated,
          });
          continue;
        }
      } catch {
        // fall through to signed URL
      }
    }

    const { data: signed } = await admin.storage
      .from("research-attachments")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (signed?.signedUrl) {
      out.push({ name, contentType, size, url: signed.signedUrl });
    }
  }
  return out;
}
