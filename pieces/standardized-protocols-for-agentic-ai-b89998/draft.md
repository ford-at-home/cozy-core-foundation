![Whiteboard sketch of the agentic AI protocol stack](https://raw.githubusercontent.com/ford-at-home/cozy-core-foundation/6b2a9569cdfb3fb5b5f603559204aa08cc0c1c3d/pieces/standardized-protocols-for-agentic-ai-b89998/assets/standardized-protocols-for-agentic-ai-b89998-cover.png)

# Standardized Protocols for Agentic AI: The Stack Is Starting to Settle

The easiest mistake in agentic AI right now is to treat every protocol launch as a standards war.

That reading is too flat.

The better reading is architectural: the ecosystem is sorting itself into layers. One layer lets agents call tools. Another lets agents hand tasks to other agents. Other layers handle identity, discovery, transport, and governance.

The noise comes from vendors and projects describing their layer as if it explains the whole system.

It does not.

The practical stack is starting to look like this:

| Layer | What it decides | Protocols to watch |
|---|---|---|
| Identity | Who is this agent? | W3C DID in ANP, AGNTCY AgentFacts ([ANP discovery specification](https://agent-network-protocol.com/specs/1.1/agent-discovery), [Cisco Outshift announcement](https://outshift.cisco.com/blog/ai-ml/agntcy-donated-to-linux-foundation)) |
| Discovery | What can it do? | A2A Agent Cards, ANP Agent Description, MCP server discovery ([A2A GitHub specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md), [ANP discovery specification](https://agent-network-protocol.com/specs/1.1/agent-discovery), [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18)) |
| Tool invocation | How does an agent call external data or actions? | MCP, OpenAPI, vendor tool APIs ([MCP specification](https://modelcontextprotocol.io/specification/2025-06-18), [OpenAPI Specification](https://spec.openapis.org/oas/v3.1.0), [OpenAI function calling docs](https://developers.openai.com/api/docs/guides/function-calling)) |
| Agent handoff | How does one agent delegate work to another? | A2A, ANP, ACP-derived patterns ([Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/), [ANP GitHub](https://github.com/agent-network-protocol/AgentNetworkProtocol), [IBM Research ACP](https://research.ibm.com/projects/agent-communication-protocol)) |
| Transport | How do messages move? | HTTPS, JSON-RPC over HTTP, gRPC, AGNTCY SLIM ([A2A protocol resources](https://a2aprotocol.org/), [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18), [Cisco Outshift announcement](https://outshift.cisco.com/blog/ai-ml/agntcy-donated-to-linux-foundation)) |
| Governance | Who maintains the contract? | Linux Foundation AAIF, IEEE, W3C ([Linux Foundation AAIF announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation), [IEEE active PARs](https://sagroups.ieee.org/ai-sc/active-pars), [W3C AI Agent Protocol Community Group](https://www.w3.org/groups/cg/agentprotocol)) |

That is the piece worth writing. Not "MCP versus A2A." Not "which vendor wins agents." The useful question is simpler: where does each protocol sit, and what failure does it remove?

## Why protocols showed up now

Agent frameworks could get away with bespoke wiring while demos lived inside one runtime. The problem changed once teams wanted agents, tools, models, and enterprise systems to cooperate across vendor boundaries. [Source needed: pre-2024 interoperability patterns across LangChain, AutoGen, CrewAI, and similar frameworks.]

The pressure came from three directions.

First, tool count exploded. Agents need databases, SaaS APIs, file systems, browsers, search, internal services, and workflow systems. Point-to-point integration becomes a tax on every new agent.

Second, multi-agent workflows stopped being a research curiosity. If one agent gathers context, another negotiates with a system of record, and another prepares an artifact, those agents need a common task handoff format.

Third, buyers got nervous about lock-in. Nobody wants the pre-USB peripheral problem, but with enterprise automation instead of printers.

That is why the strongest protocol designs borrow boring web primitives: JSON-RPC, HTTP, REST, hyperlinks, JSON-LD, and decentralized identifiers ([MCP specification](https://modelcontextprotocol.io/specification/2025-06-18), [A2A protocol resources](https://a2aprotocol.org/), [ANP discovery specification](https://agent-network-protocol.com/specs/1.1/agent-discovery)).

Boring is the point. Agent systems need fewer magical abstractions and more shared contracts.

## MCP is the tool layer

The Model Context Protocol is the cleanest example of the tool layer. Anthropic announced MCP on November 25, 2024 as an open protocol for connecting AI assistants to external systems, and the public spec defines a client-host-server architecture over JSON-RPC 2.0 with primitives for resources, tools, and prompts ([Anthropic announcement](https://www.anthropic.com/news/model-context-protocol), [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18)).

That division matters:

- Resources are read-only context.
- Tools are executable actions.
- Prompts are reusable instruction templates.

In practice, the MCP server becomes the adapter around a system. The host application embeds an MCP client. The model does not need a bespoke integration for every database, file system, or SaaS API. It needs a way to discover and call the MCP server exposed by that system ([MCP specification](https://modelcontextprotocol.io/specification/2025-06-18)).

That is why the "USB-C for tools" analogy stuck. It is not perfect, but it is directionally useful. MCP is not trying to define every behavior inside an agent. It is trying to standardize the edge where an agent reaches outside itself ([Anthropic announcement](https://www.anthropic.com/news/model-context-protocol)).

The adoption signal is real without needing to overstate it. OpenAI's Agents SDK documents MCP support for hosted tools and integrations ([OpenAI Agents SDK tools](https://openai.github.io/openai-agents-python/tools)). Microsoft documents MCP as a way to connect Azure AI Foundry agents to external tools ([Azure AI Foundry MCP docs](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/foundry/agents/how-to/tools/model-context-protocol.md)). LangChain ships MCP adapters for LangChain and LangGraph ([LangChain MCP docs](https://docs.langchain.com/oss/python/langchain/mcp)).

The governance signal matters too. The Linux Foundation announced the Agentic AI Foundation with project contributions including MCP, goose, and AGENTS.md, with Anthropic, OpenAI, and Block named in the announcement ([Linux Foundation AAIF announcement](https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation)). That does not make MCP finished. It makes the "Anthropic-only protocol" critique less useful.

The limit is security. MCP standardizes the shape of tool access, but the research does not show a mature native authorization model at the protocol layer. OWASP now has an MCP-specific cheat sheet naming risks like tool poisoning, prompt injection through tool descriptions, rug-pull attacks, and overbroad permissions ([OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)).

That is the trade: interoperability arrived before the trust model hardened.

## A2A is the task handoff layer

Agent2Agent sits one layer up.

Google announced A2A on April 9, 2025 with more than 50 launch partners, including enterprise software vendors, agent frameworks, data companies, and major consultancies ([Google Developers Blog](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)). The protocol centers on a different primitive than MCP. MCP exposes resources and tools. A2A moves tasks between agents.

The core objects are straightforward: an Agent Card describes identity, capabilities, skills, modalities, and authentication requirements; a Task is the unit of delegated work; Artifacts are outputs; Messages and Parts carry content inside the task. Public A2A documentation describes JSON-RPC 2.0 over HTTP(S), with server-sent events for streaming ([A2A protocol resources](https://a2aprotocol.org/), [A2A GitHub specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)).

This is why "MCP versus A2A" is mostly the wrong framing. A2A does not replace MCP unless you collapse all agent behavior into one layer.

The implementation pattern is simpler than the discourse: one agent delegates a task to another agent over A2A; either agent can use MCP to read context, call a workflow, query a database, or write an artifact through a governed tool surface. A2A carries the work request and its lifecycle. MCP carries the tool call.

The interface is different because the problem is different.

MCP asks: what tool can this agent call?

A2A asks: what work can this other agent accept, and how will I track the result?

The consolidation story is less settled. IBM Research launched Agent Communication Protocol as a lightweight REST-native agent interoperability protocol in 2025 ([IBM Research ACP](https://research.ibm.com/projects/agent-communication-protocol)). The claim that ACP later merged into A2A under Linux Foundation governance is important enough that the final institutional version should wait for a primary source. [Source needed: primary Linux Foundation, A2A project, or IBM source confirming the ACP-to-A2A merger and migration path.]

## ANP and AGNTCY are the decentralization and infrastructure pressure

The Agent Network Protocol is the most web-native of the group. Its GitHub project describes a vision for agents connecting through an open, secure collaboration network, and its discovery specification uses W3C decentralized identifiers and JSON-LD metadata ([ANP GitHub](https://github.com/agent-network-protocol/AgentNetworkProtocol), [ANP discovery specification](https://agent-network-protocol.com/specs/1.1/agent-discovery)).

That choice is philosophical and technical. ANP tries to make agents addressable without depending on one central registry. It is strongest when the problem is cross-organization discovery and trust. It is weakest where enterprises are not ready to operate DID infrastructure or where ecosystem gravity matters more than architecture. [Source needed: enterprise DID readiness and ANP adoption evidence.]

AGNTCY comes at the problem from infrastructure. Cisco's Outshift described donating AGNTCY to the Linux Foundation on July 29, 2025, with components including SLIM for secure low-latency messaging, Agent Directory, Agent Identity, and an OIDC Gateway ([Cisco Outshift announcement](https://outshift.cisco.com/blog/ai-ml/agntcy-donated-to-linux-foundation)). The AGNTCY GitHub organization presents it as infrastructure for an "Internet of Agents" ([AGNTCY GitHub](https://github.com/agntcy)).

The overlap with A2A is real, but not identical. A2A is primarily an application-level task protocol. AGNTCY is closer to a messaging, identity, discovery, and policy stack. If A2A is the format of the work request, AGNTCY is trying to own more of the road that request travels on.

The question for both ANP and AGNTCY is not whether the architecture is elegant. It is whether enough agents will be published, discoverable, and trusted through those rails to make the network effects real. For now, MCP and A2A have the clearer adoption story.

## Vendor formats are not disappearing

OpenAI function calling predates the current protocol wave. The current API documentation describes function calling as a way for models to produce structured tool calls against developer-defined schemas ([OpenAI function calling docs](https://developers.openai.com/api/docs/guides/function-calling)). The Agents SDK adds runtime concepts such as agents, tools, handoffs, and tracing ([OpenAI Agents SDK guide](https://developers.openai.com/api/docs/guides/agents)).

Anthropic's Skills are different again. Anthropic describes Skills as folders containing a `SKILL.md` file and optional assets that teach Claude how to perform specialized tasks ([Anthropic Skills announcement](https://www.anthropic.com/news/skills)).

Skills are packaging for know-how. MCP is a network protocol for callable tools. The boundary blurs when a Skill includes executable scripts, but the conceptual split is still useful: Skills teach the agent what to know; MCP exposes what it can call.

The pattern is not "open protocols kill proprietary formats." The pattern is that vendors keep runtime semantics and product-specific affordances while adopting open wire protocols where interoperability becomes unavoidable.

That is normal. SQL did not eliminate database products. HTTP did not eliminate application frameworks. A shared protocol layer usually makes the product layer more competitive, not less.

## Standards bodies are behind the implementation curve

The formal standards work exists, but it is not where day-to-day interoperability is being decided yet.

IEEE lists P3709 for framework and technical requirements of agentic AI, P7022 for trustworthy generative and agentic AI in enterprise applications, and P7804 for agentic AI in school food-waste logistics ([IEEE P3709](https://standards.ieee.org/ieee/3709/12159), [IEEE P7022](https://standards.ieee.org/ieee/7022/12533), [IEEE P7804](https://standards.ieee.org/ieee/7804/12426)). W3C has an AI Agent Protocol Community Group exploring open agent interaction standards ([W3C AI Agent Protocol Community Group](https://www.w3.org/groups/cg/agentprotocol)), and the group has published an Agent Network Protocol white paper ([W3C CG white paper](https://w3c-cg.github.io/ai-agent-protocol/)).

That matters for legitimacy and future convergence. But the running code is ahead of the standards process. MCP, A2A, ANP, and AGNTCY are the practical reference points because teams can build against them now.

The likely sequence is not standards body first, implementation second. It is implementation first, foundation governance second, formal standards later.

## The real unresolved issue is security

The protocol map is becoming easier to draw. The security map is not.

Tool access is dangerous because tools touch real systems. Agent-to-agent delegation is dangerous because one agent can launder another agent's authority. Discovery is dangerous because capability metadata can become an attack surface. Transport is dangerous because streaming and long-running tasks create new lifecycle states to secure.

The research points most clearly at MCP security because OWASP has already named an MCP-specific threat surface: tool poisoning, malicious descriptions, prompt injection, rug pulls, and excessive permissions ([OWASP MCP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html)). But the same structural problem applies across the stack. Interoperability expands the blast radius of trust mistakes.

For implementation teams, the immediate checklist is:

1. Treat tool descriptions and agent capability metadata as untrusted input.
2. Scope tool permissions narrowly, and assume broad tool grants will be abused.
3. Separate discovery from authorization. Knowing an agent or tool exists should not mean it can be invoked.
4. Log task handoffs, tool calls, artifacts, and authority changes as one audit trail.
5. Demand revocation and provenance mechanisms before letting agents operate across organizational boundaries.

Those are not protocol niceties. They are the difference between interoperability and distributed privilege escalation.

The next serious protocol work should not just be richer streaming, better registries, or cleaner SDK ergonomics. It should be provenance, least privilege, signed tool metadata, scoped authorization, revocation, auditability, and policy that survives cross-agent handoffs. MCP security extensions such as OAuth-bound servers, tool-signing, and provenance metadata are plausible next steps, but this draft does not yet have stable primary specifications for those extensions. [Source needed: current primary specs or accepted proposals for MCP OAuth binding, tool signing, and provenance metadata.]

## The thesis

The agentic AI protocol landscape is not consolidated because one protocol won.

It is consolidating because the layers are becoming legible.

MCP is becoming the tool-call contract. A2A is becoming the agent task handoff contract. ANP and AGNTCY pressure-test decentralization, discovery, identity, transport, and policy. Vendor APIs and Skills still matter, but they sit above or beside the open protocols rather than replacing them. IEEE, W3C, and the Linux Foundation matter because they can turn running code into durable governance.

The near-term architecture choice is not "which protocol do we bet the company on?"

It is:

1. Use MCP when an agent needs controlled access to tools, data, or actions.
2. Use A2A when agents need to delegate tasks and exchange artifacts across boundaries.
3. Watch ANP and AGNTCY when the hard problem is decentralized discovery, identity, or messaging infrastructure.
4. Treat security as a first-class protocol requirement, not an SDK afterthought.

That last point is the one that will age the worst if teams ignore it.

The stack is starting to settle. The trust model has to catch up.
