// Cursor Cloud Agents REST v0 provider. Bound to the documented surface in
// docs/cursor-api-research.md — do not add fields the docs don't establish.
//
// Idempotency warning: the vendor API has NO idempotency key. Callers must
// insert the run row BEFORE createAgent and must never blind-retry a create
// that timed out (that mints a second billable agent). Ambiguity is the
// caller's dispatch_unknown state; the reconciler resolves it.

import type { AgentProvider, CreateAgentInput, ExternalAgent } from "./provider.ts";
import { ProviderHttpError } from "./provider.ts";

const BASE_URL = "https://api.cursor.com";
const CREATE_TIMEOUT_MS = 20_000;

// deno-lint-ignore no-explicit-any
function toExternalAgent(body: any): ExternalAgent {
  return {
    externalAgentId: String(body.id),
    rawStatus: String(body.status ?? ""),
    branch: body.target?.branchName ?? null,
    prUrl: body.target?.prUrl ?? null,
    summary: typeof body.summary === "string" ? body.summary : null,
  };
}

export class CursorProvider implements AgentProvider {
  readonly name = "cursor";

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("CursorProvider requires an API key");
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderHttpError(res.status, text);
    }
    return res;
  }

  async createAgent(input: CreateAgentInput): Promise<ExternalAgent> {
    const payload: Record<string, unknown> = {
      prompt: { text: input.prompt },
      source: { repository: input.repository, ref: input.ref },
      target: {
        autoCreatePr: input.autoCreatePr,
        ...(input.branchName ? { branchName: input.branchName } : {}),
      },
      ...(input.model ? { model: input.model } : {}),
      ...(input.webhookUrl && input.webhookSecret
        ? { webhook: { url: input.webhookUrl, secret: input.webhookSecret } }
        : {}),
    };
    const res = await this.request("/v0/agents", {
      method: "POST",
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });
    return toExternalAgent(await res.json());
  }

  async getAgent(externalAgentId: string): Promise<ExternalAgent> {
    const res = await this.request(`/v0/agents/${encodeURIComponent(externalAgentId)}`);
    return toExternalAgent(await res.json());
  }

  async stopAgent(externalAgentId: string): Promise<void> {
    await this.request(`/v0/agents/${encodeURIComponent(externalAgentId)}/stop`, {
      method: "POST",
    });
  }
}

export function providerFromEnv(): AgentProvider | null {
  const apiKey = Deno.env.get("CURSOR_API_KEY")?.trim();
  return apiKey ? new CursorProvider(apiKey) : null;
}
