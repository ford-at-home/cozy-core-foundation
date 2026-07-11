// In-memory stub provider: lets the whole controller (dispatch -> webhook ->
// reconcile -> fetch) be exercised without a Cursor key or network. Used by
// tests and by start-workflow when AGENT_PROVIDER=stub.

import type { AgentProvider, CreateAgentInput, ExternalAgent } from "./provider.ts";

export class StubProvider implements AgentProvider {
  readonly name = "stub";
  private agents = new Map<string, ExternalAgent & { createdAt: number }>();

  constructor(
    // How long a stub agent "runs" before reporting FINISHED.
    private readonly runMs = 0,
  ) {}

  createAgent(input: CreateAgentInput): Promise<ExternalAgent> {
    const id = `bc_stub_${crypto.randomUUID().slice(0, 8)}`;
    const agent = {
      externalAgentId: id,
      rawStatus: "CREATING",
      branch: input.branchName ?? `cursor/stub-${id}`,
      prUrl: null,
      summary: null,
      createdAt: Date.now(),
    };
    this.agents.set(id, agent);
    return Promise.resolve({ ...agent });
  }

  getAgent(externalAgentId: string): Promise<ExternalAgent> {
    const agent = this.agents.get(externalAgentId);
    if (!agent) return Promise.reject(new Error(`stub: unknown agent ${externalAgentId}`));
    const elapsed = Date.now() - agent.createdAt;
    const rawStatus = elapsed >= this.runMs ? "FINISHED" : "RUNNING";
    return Promise.resolve({ ...agent, rawStatus, summary: rawStatus === "FINISHED" ? "stub run complete" : null });
  }

  stopAgent(externalAgentId: string): Promise<void> {
    if (!this.agents.has(externalAgentId)) {
      return Promise.reject(new Error(`stub: unknown agent ${externalAgentId}`));
    }
    return Promise.resolve();
  }
}
