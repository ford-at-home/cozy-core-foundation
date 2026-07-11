// Server route: POST /api/transcribe
//
// Accepts a multipart audio upload from an authenticated user and proxies it
// to the Lovable AI Gateway's OpenAI-compatible transcription endpoint.
// Returns { text } for the client to append into the style textarea.
//
// Auth: verifies the caller's Supabase bearer token before spending credits.
// LOVABLE_API_KEY stays server-side.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const MAX_BYTES = 24 * 1024 * 1024; // 24 MiB — under the Gateway's 25 MiB cap
const MODEL = "openai/gpt-4o-mini-transcribe";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !LOVABLE_API_KEY) {
          return json({ error: "Server misconfigured" }, 500);
        }

        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "");
        if (!token || token.split(".").length !== 3) {
          return json({ error: "Unauthorized" }, 401);
        }
        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return json({ error: "Unauthorized" }, 401);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Expected multipart/form-data" }, 400);
        }
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return json({ error: "Audio file is missing or empty" }, 400);
        }
        if (file.size > MAX_BYTES) {
          return json({ error: "Recording too large (max ~24 MiB)" }, 413);
        }

        // Name the part for its real container so the model can decode it.
        const type = (file.type || "audio/webm").split(";")[0];
        const ext =
          ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg" } as Record<string, string>)[
            type
          ] ?? "webm";

        const upstream = new FormData();
        upstream.append("model", MODEL);
        upstream.append("file", file, `recording.${ext}`);

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}` },
          body: upstream,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          if (res.status === 402) {
            return json({ error: "Out of AI credits. Add credits in workspace billing to keep dictating." }, 402);
          }
          if (res.status === 429) {
            return json({ error: "Transcription rate-limited. Try again in a moment." }, 429);
          }
          return json({ error: `Transcription failed (${res.status}): ${detail.slice(0, 300)}` }, 502);
        }
        const body = (await res.json().catch(() => ({}))) as { text?: string };
        return json({ text: body.text ?? "" });
      },
    },
  },
});