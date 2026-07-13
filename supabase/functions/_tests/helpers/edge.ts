// Harness for driving Edge Function HTTP handlers with fake Requests — no
// real network, no real database (audit P1.3 / plan phase C5).
//
// Two pieces:
//
//  - loadHandler(): captures the handler a function module passes to
//    Deno.serve at import time. Modules are cached by the runtime, so each
//    index.ts is imported once and the captured handler is memoized.
//
//  - withSupabaseStub(): swaps globalThis.fetch for a minimal fake of the
//    Supabase Auth/REST/Storage HTTP APIs for the duration of one test.
//    Defaults are lenient (empty selects, echoing inserts, no-op RPCs) so a
//    test only scripts the tables that matter to its assertion; any fetch
//    that leaves the fake Supabase origin throws, keeping tests airtight
//    against accidental provider calls.

// deno-lint-ignore-file no-explicit-any

export const SUPABASE_URL = "http://supabase.test";

/** Two fake authenticated users for ownership tests. */
export const USER_A = { id: "aaaaaaaa-0000-4000-8000-000000000001", token: "token-user-a" };
export const USER_B = { id: "bbbbbbbb-0000-4000-8000-000000000002", token: "token-user-b" };

// Handlers read these at request time (http.ts env(), start-workflow handle()).
Deno.env.set("SUPABASE_URL", SUPABASE_URL);
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-for-tests");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-key-for-tests");
// The stub provider fabricates agents in memory — no Cursor API, no network.
Deno.env.set("AGENT_PROVIDER", "stub");
// Hygiene: none of the optional provider/config secrets may leak in from the
// host environment, or tests would take non-deterministic branches.
for (const k of [
  "PARALLEL_API_KEY",
  "LOVABLE_API_KEY",
  "CURSOR_API_KEY",
  "CURSOR_WEBHOOK_SECRET",
  "CREDITS_MODE",
  "APP_PUBLIC_URL",
  "AGENT_IMAGE_SECRET",
  "TEST_ACCOUNT_IDS",
]) {
  Deno.env.delete(k);
}

export type EdgeHandler = (req: Request) => Response | Promise<Response>;

const captured = new Map<string, EdgeHandler>();

/**
 * Import an Edge Function module (path relative to supabase/functions/,
 * e.g. "start-workflow/index.ts") and return the handler it registered.
 */
export async function loadHandler(fnPath: string): Promise<EdgeHandler> {
  const hit = captured.get(fnPath);
  if (hit) return hit;
  const realServe = Deno.serve;
  let handler: EdgeHandler | null = null;
  (Deno as any).serve = (arg1: any, arg2?: any) => {
    handler = typeof arg1 === "function" ? arg1 : arg2;
    return {
      finished: Promise.resolve(),
      shutdown: () => Promise.resolve(),
      ref() {},
      unref() {},
    };
  };
  try {
    await import(new URL(`../../${fnPath}`, import.meta.url).href);
  } finally {
    (Deno as any).serve = realServe;
  }
  if (!handler) throw new Error(`no Deno.serve handler captured from ${fnPath}`);
  captured.set(fnPath, handler);
  return handler;
}

/** Build the POST Request a browser/server-fn would send. */
export function edgeRequest(body: unknown, token?: string): Request {
  return new Request("http://edge.test/functions/v1/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
}

// ---------------------------------------------------------------------------
// Fake Supabase server
// ---------------------------------------------------------------------------

export type RestQuery = {
  method: string; // GET | POST | PATCH | DELETE | HEAD
  table: string;
  params: URLSearchParams;
  body: any;
  prefer: string;
  accept: string;
};

export type RestResult = { status?: number; body?: unknown; count?: number } | undefined;

export type Routes = {
  /** Per-table REST handler. Return undefined to fall back to the default. */
  tables?: Record<string, (q: RestQuery) => RestResult>;
  /** Per-function RPC handler. Return undefined for the default (null/200). */
  rpc?: Record<string, (args: any) => RestResult>;
  /**
   * Handler for fetches that leave the fake Supabase origin (e.g. the
   * Lovable AI gateway). Return undefined to keep the airtight default:
   * any unscripted external fetch throws.
   */
  external?: (url: URL, init: { method: string; body: any }) => Response | undefined;
};

/** PostgREST-style unique-violation result for insert-race tests. */
export const UNIQUE_VIOLATION: RestResult = {
  status: 409,
  body: {
    code: "23505",
    message: "duplicate key value violates unique constraint",
    details: null,
    hint: null,
  },
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function defaultRest(q: RestQuery): Response {
  switch (q.method) {
    case "HEAD":
      return new Response(null, { status: 200, headers: { "content-range": "*/0" } });
    case "GET":
      return json([]);
    case "POST": {
      // Echo the inserted row(s) back with a generated id, the way
      // PostgREST does under Prefer: return=representation.
      if (!q.prefer.includes("return=representation")) {
        return new Response(null, { status: 201 });
      }
      const rows = (Array.isArray(q.body) ? q.body : [q.body ?? {}]).map((r: any) => ({
        id: crypto.randomUUID(),
        ...r,
      }));
      const single = q.accept.includes("vnd.pgrst.object+json");
      return json(single ? rows[0] : rows, 201);
    }
    default: // PATCH | DELETE
      if (q.prefer.includes("return=representation")) return json([]);
      return new Response(null, { status: 204 });
  }
}

function makeFakeFetch(routes: Routes): typeof fetch {
  return (async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input));
    const method = (req?.method ?? init?.method ?? "GET").toUpperCase();
    const headers = new Headers(req ? req.headers : init?.headers);
    const rawBody = req ? await req.text() : typeof init?.body === "string" ? init.body : "";
    let body: any = null;
    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      body = rawBody;
    }

    if (url.origin !== SUPABASE_URL) {
      const out = routes.external?.(url, { method, body });
      if (out) return out;
      throw new Error(`unexpected external fetch in test: ${method} ${url.href}`);
    }

    // ---- Auth: GET /auth/v1/user -------------------------------------
    if (url.pathname === "/auth/v1/user") {
      const token = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
      const user = [USER_A, USER_B].find((u) => u.token === token);
      if (!user) return json({ code: 401, msg: "invalid JWT" }, 401);
      return json({ id: user.id, aud: "authenticated", role: "authenticated" });
    }

    // ---- RPC: POST /rest/v1/rpc/{fn} ----------------------------------
    const rpcMatch = url.pathname.match(/^\/rest\/v1\/rpc\/([^/]+)$/);
    if (rpcMatch) {
      const out = routes.rpc?.[rpcMatch[1]]?.(body);
      return json(out?.body ?? null, out?.status ?? 200);
    }

    // ---- REST: /rest/v1/{table} ---------------------------------------
    const restMatch = url.pathname.match(/^\/rest\/v1\/([^/]+)$/);
    if (restMatch) {
      const q: RestQuery = {
        method,
        table: restMatch[1],
        params: url.searchParams,
        body,
        prefer: headers.get("prefer") ?? "",
        accept: headers.get("accept") ?? "",
      };
      const out = routes.tables?.[q.table]?.(q);
      if (out !== undefined) {
        if (q.method === "HEAD") {
          return new Response(null, {
            status: out.status ?? 200,
            headers: { "content-range": `*/${out.count ?? 0}` },
          });
        }
        return json(out.body, out.status ?? 200);
      }
      return defaultRest(q);
    }

    // ---- Storage ---------------------------------------------------------
    if (url.pathname.startsWith("/storage/v1/")) {
      const rel = url.pathname.slice("/storage/v1".length);
      const upload = rel.match(/^\/object\/upload\/sign\/(.+)$/);
      if (upload) return json({ url: `/object/upload/sign/${upload[1]}?token=test-token` });
      const sign = rel.match(/^\/object\/sign\/(.+)$/);
      if (sign) return json({ signedURL: `/object/sign/${sign[1]}?token=test-token` });
      if (method === "DELETE") return json([]);
      return json({});
    }

    throw new Error(`unhandled fake-supabase route: ${method} ${url.pathname}`);
  }) as typeof fetch;
}

/** Run one test body against the fake Supabase server. */
export async function withSupabaseStub<T>(routes: Routes, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = makeFakeFetch(routes);
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}
