// Supabase's FunctionsHttpError message is generic ("non-2xx status code").
// Edge functions return a structured { error, code, requestId } body — pull
// it out so callers see a real message.
export async function extractEdgeError(error: unknown, fn: string): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.text !== "function") return fallback;
  try {
    const raw = await ctx.text();
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as { error?: string; code?: string; requestId?: string };
      if (parsed?.error) {
        const bits = [parsed.error];
        if (parsed.code) bits.push(`[${parsed.code}]`);
        if (parsed.requestId) bits.push(`(req ${parsed.requestId})`);
        return bits.join(" ");
      }
    } catch {
      // not JSON — fall through
    }
    return `${fn}: ${raw.slice(0, 300)}`;
  } catch {
    return fallback;
  }
}
