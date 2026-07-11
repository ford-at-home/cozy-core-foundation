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
  const imageCreds = await buildImageCreds(runId);

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
