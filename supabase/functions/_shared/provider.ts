// Provider adapter boundary (plan v2 §requirements). Vendor response shapes
// stop here: edge functions and the reconciler speak only these types. The
// durable orchestration (idempotency, state transitions, event log) lives in
// the functions + Postgres, not in the provider.

export interface CreateAgentInput {
  prompt: string;
  repository: string; // resolved server-side, never from the browser
  ref: string;
  branchName?: string;
  autoCreatePr: boolean;
  model?: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface ExternalAgent {
  externalAgentId: string;
  rawStatus: string;
  branch: string | null;
  prUrl: string | null;
  summary: string | null;
}

export interface AgentProvider {
  readonly name: string;
  createAgent(input: CreateAgentInput): Promise<ExternalAgent>;
  getAgent(externalAgentId: string): Promise<ExternalAgent>;
  /** Cursor "stop" pauses; confirmation of cancellation comes from reconcile. */
  stopAgent(externalAgentId: string): Promise<void>;
}

/** Thrown for non-2xx vendor responses so callers can classify retryability. */
export class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Provider responded ${status}: ${body.slice(0, 300)}`);
    this.name = "ProviderHttpError";
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}
