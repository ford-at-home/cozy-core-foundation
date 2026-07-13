// Boilerplate helpers for JWT-authenticated edge functions.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, errorResponse, jsonResponse, newRequestId } from "./observability.ts";

export function env() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_KEY) {
    throw new Error("env_missing");
  }
  return { SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_KEY };
}

export async function authenticate(req: Request) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SERVICE_KEY } = env();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userId: data.user.id, admin };
}

export function serve(fn: string, handler: (req: Request, rid: string) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    const rid = newRequestId();
    if (req.method !== "POST") return errorResponse(fn, 405, "Method not allowed", { requestId: rid });
    try {
      return await handler(req, rid);
    } catch (e) {
      if (e instanceof Response) return e;
      return errorResponse(fn, 500, "Unhandled server error", { requestId: rid, code: "unhandled", cause: e });
    }
  };
}

export const j = (body: unknown, status = 200, rid?: string) => jsonResponse(body, status, rid);
export const e = (fn: string, status: number, message: string, opts: any = {}) =>
  errorResponse(fn, status, message, opts);
