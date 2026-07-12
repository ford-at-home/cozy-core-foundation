// Shared observability helpers for edge functions.
//
// Goals:
//   - Log request inputs in a compact, structured shape (JSON lines) that is
//     easy to grep in the edge-function log stream.
//   - Redact anything that looks sensitive (auth tokens, API keys, long
//     opaque strings, base64 blobs) before it ever touches the log line.
//   - Give every request a short correlation id so a failing response can be
//     traced back to the log line that produced it.
//   - Return errors as a consistent JSON envelope so the browser (and the
//     Supabase functions SDK) can surface a message instead of a generic
//     "non-2xx status" string.

export type LogFields = Record<string, unknown>;

const SENSITIVE_KEY_RE = /(authorization|api[_-]?key|secret|token|password|cookie|session|bearer|jwt|service[_-]?role|style[_-]?text)/i;
// Values that are almost certainly credentials even when the key name is bland.
const OPAQUE_TOKEN_RE = /^(eyJ[\w-]{20,}|sk-[\w-]{20,}|sb[a-z]*_[\w-]{20,})/i;

const MAX_STRING_LEN = 300;
const MAX_DEPTH = 4;

/** Recursively redact secrets and truncate long strings for safe logging. */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[max-depth]";
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redactForLog(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = redactForLog(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

function redactString(s: string): string {
  if (OPAQUE_TOKEN_RE.test(s)) return "[redacted]";
  if (s.length > MAX_STRING_LEN) {
    return `${s.slice(0, MAX_STRING_LEN)}…[+${s.length - MAX_STRING_LEN} chars]`;
  }
  return s;
}

/** Short correlation id — collision-tolerant for per-request logging. */
export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Emit a structured JSON log line, prefixed with the function name. */
export function logEvent(fn: string, level: "info" | "warn" | "error", fields: LogFields): void {
  const line = JSON.stringify({ fn, level, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export type ErrorEnvelope = {
  error: string;
  code?: string;
  requestId?: string;
  details?: unknown;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Return a JSON response with CORS + a stable request id header. */
export function jsonResponse(body: unknown, status: number, requestId?: string): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...CORS_HEADERS,
  };
  if (requestId) headers["x-request-id"] = requestId;
  return new Response(JSON.stringify(body), { status, headers });
}

/** Build a structured error response and log it under the same requestId. */
export function errorResponse(
  fn: string,
  status: number,
  message: string,
  opts: { requestId?: string; code?: string; details?: unknown; cause?: unknown } = {},
): Response {
  const { requestId, code, details, cause } = opts;
  const payload: ErrorEnvelope = { error: message };
  if (code) payload.code = code;
  if (requestId) payload.requestId = requestId;
  if (details !== undefined) payload.details = redactForLog(details);
  logEvent(fn, status >= 500 ? "error" : "warn", {
    requestId,
    status,
    code,
    message,
    details: details === undefined ? undefined : redactForLog(details),
    cause: cause === undefined ? undefined : serializeCause(cause),
  });
  return jsonResponse(payload, status, requestId);
}

function serializeCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack?.split("\n").slice(0, 5).join("\n") };
  }
  return redactForLog(cause);
}

export const corsHeaders = CORS_HEADERS;