---
source: parallel-deep-research
query: "Agent skills and mcp and other agentic ai standards and protocols"
processor: ultra-fast
run_id: trun_3cad0ebea15c480ea6517297709a105a
date: "2026-07-12T09:29:37.522Z"
---

# Agent Skills, MCP, and the Standards Landscape for Agentic AI

## Executive Summary

The agentic AI ecosystem has rapidly converged on a small set of open standards that try to answer three distinct questions: (1) how a model gets access to tools and data, (2) how it packages a reusable body of expertise, and (3) how independent agents find and collaborate with each other. The dominant protocol today is Anthropic's **Model Context Protocol (MCP)**, released on 2024-11-25 as an open standard for connecting LLMs to external systems ([40]). By April 2026 the official MCP registry had crossed 800 servers, with roughly 13,000+ MCP servers running across the broader ecosystem ([26]).

Two newer standards attempt to fill gaps MCP does not cover:

- **A2A (Agent-to-Agent)**, launched by Google on 2025-04-09 with 50+ launch partners, targets discovery, negotiation and collaboration between opaque agents over JSON-RPC 2.0 and HTTP/SSE ([35]). Google donated A2A to the Linux Foundation on 2025-06-23 ([47]).
- **Agent Skills**, introduced by Anthropic on 2025-10-16 and published as the open `agentskills.io` standard on 2025-12-18, let an agent load folders of instructions, scripts, and resources on demand ([37]).

On 2025-12-09 the Linux Foundation announced the **Agentic AI Foundation (AAIF)** with three founding projects: MCP, Block's **goose** agent framework, and OpenAI's **AGENTS.md** spec (Linux Foundation Announces AAIF). Several adjacent specifications (ACP, ANP, AG-UI, NLWeb, Agent2Agent, AGENTS.md) are still in flight, and a real interoperability gap remains between them. Security researchers have flagged prompt-injection exposure in MCP at least since April 2025 ([92]).

The remainder of this report unpacks each protocol, how they relate, the actors behind them, and the open questions.

---

## 1. Model Context Protocol (MCP) - The De Facto Tool-Use Standard

### 1.1 Origin and Motivation

Anthropic released MCP on **2024-11-25** as an open standard, framing it as "a new standard for connecting AI assistants to the systems where data lives" ([40]). The motivation was the fragmentation problem: every new data source previously required its own bespoke integration, which did not scale. MCP is a client-server protocol in which an **MCP host** (the LLM application such as Claude Desktop, an IDE, or an agent framework) connects to one or more **MCP servers** that expose capabilities and data through a uniform JSON-RPC interface ([90]).

### 1.2 Core Primitives

The MCP data layer defines five primitives ([90]):

- **Resources**: read-only, addressable data (files, database rows, API responses).
- **Tools**: callable functions the model can invoke; may require user approval.
- **Prompts**: reusable, parameterized prompt templates.
- **Sampling**: lets a server ask the host to run an LLM completion (rare; requires explicit user consent).
- **Roots**: filesystem boundaries that scope a server's access for safety.

Two transports are standardized: **stdio** for local subprocess servers, and **Streamable HTTP** (which replaced Server-Sent Events in the June 2025 spec revision) for remote servers ([84], Why MCP Deprecated SSE - blog.fka.dev).

### 1.3 Adoption and Ecosystem

- Open-source **SDKs** ship for Python, TypeScript, Java, Kotlin, C#, Ruby, Go, Rust, Swift and others (MCP servers repo - github.com/modelcontextprotocol).
- **OpenAI** formally added MCP support to the Responses API and Agents SDK in 2025, signaling cross-vendor convergence (Function Calling in the OpenAI API - OpenAI Help Center).
- The official MCP **registry** launched in preview on 2025-09-08 and crossed 800 servers by April 2026, with roughly 13,000 MCP servers estimated across the wider ecosystem (MCP Server Registry - modelcontextprotocol.info, [26]).
- Block publicly stated that it "co-developed the Model Context Protocol (MCP) with Anthropic" ([108]).

### 1.4 Governance

On **2025-12-09**, Anthropic donated MCP to the newly created **Agentic AI Foundation (AAIF)** under the Linux Foundation, alongside Block's goose and OpenAI's AGENTS.md (Linux Foundation Announces AAIF). This transferred stewardship from a single vendor to a vendor-neutral home. The AAIF is described as "a directed fund," a model the Linux Foundation has used successfully for Kubernetes (CNCF) and Node.js (OpenAI co-founds the Agentic AI Foundation - OpenAI).

---

## 2. Agent Skills - Folder-Based Expertise for Agents

### 2.1 Concept

Anthropic introduced **Agent Skills** on 2025-10-16 as a mechanism to "build specialized agents using files and folders" ([37]). A Skill is just a directory containing a `SKILL.md` file (Markdown with YAML frontmatter describing `name`, `description`, optional allowed tools, and `disable-model-invocation`) plus optional scripts, templates, and reference materials. The Claude API exposes a meta-tool named `Skill` whose description is auto-generated from those frontmatter fields; when the model invokes a skill, the system injects the `SKILL.md` body as additional instructions and may execute supporting scripts ([7]).

### 2.2 Why Skills Are Different

Three properties distinguish Skills from classical "tools" or function calls:

- **Progressive disclosure**: only the name and description enter the prompt by default, keeping token cost low; the full body loads only when invoked.
- **Composability**: skills can include other skills, scripts, and structured resources.
- **Portability**: a folder is the entire artifact, so it travels between Claude Code, the Claude API, and Claude Desktop.

### 2.3 Standardization

On **2025-12-18** Anthropic published the Agent Skills specification at `agentskills.io`, "an open standard for cross-platform portability" ([37]). The reference repo and spec are public on GitHub.

---

## 3. Agent-to-Agent (A2A) Protocol

### 3.1 Launch

Google announced **A2A** on **2025-04-09** with over 50 launch partners, including Atlassian, Box, Cohere, Intuit, LangChain, MongoDB, PayPal, Salesforce, SAP, ServiceNow, UKG, Workday, and service providers Accenture, BCG, Capgemini, Cognizant, Deloitte, HCLTech, Infosys, KPMG, McKinsey, PwC, TCS, and Wipro ([35]).

### 3.2 Design Goals

A2A is built on five principles: enable agents to communicate as opaque peers, support long-running tasks, support multiple modalities (text, files, structured data, forms, iframes), be built on existing web standards (HTTP, SSE, JSON-RPC 2.0), and provide enterprise-grade security ([16]).

### 3.3 Core Concepts

- **Agent Card**: a JSON metadata document hosted at a well-known URL (e.g. `/.well-known/agent.json`) that describes the agent's identity, capabilities, skills, authentication requirements, and supported modalities ([16]).
- **Task**: the unit of work, with a unique id and a lifecycle (`submitted`, `working`, `input-required`, `completed`, `failed`, `canceled`).
- **Message / Part / Artifact**: messages are made of typed parts (text, file, data); agents emit artifacts (results).
- **Streaming**: tasks can return Server-Sent Events for incremental updates.
- **Push Notifications**: agents can register webhooks for long-running tasks.

### 3.4 Relationship to MCP

Google is explicit that A2A "complements" MCP, not replaces it: MCP gives an agent tools and context, A2A lets two agents collaborate. The A2A spec lists MCP under "Related Protocols" ([16]).

### 3.5 Governance Move

On **2025-06-23** Google donated A2A to the Linux Foundation, where it now lives under the AAIF alongside MCP. A2A is governed by a Technical Steering Committee with representatives from AWS, Cisco, Google, IBM Research, Microsoft, Salesforce, SAP, and ServiceNow ([81]).

---

## 4. AGENTS.md - The Simplest Standard

OpenAI released the **AGENTS.md** specification in August 2025 as a deliberately minimal convention: a plain Markdown file at the root of a repository that gives coding agents build/test commands and coding conventions. It is described as "a simple, open format for guiding coding agents" and was created because every agent was inventing its own format (Claude.md, Cursor rules, etc.) ([95], [94]).

- By late 2025 the site claims over 60,000 open-source projects ship an `AGENTS.md` ([95]).
- On **2025-12-09** AGENTS.md joined the AAIF as a founding project alongside MCP and goose (OpenAI co-founds the Agentic AI Foundation).

The format is intentionally trivial: a Markdown file. The "standard" is mostly social.

---

## 5. Adjacent and Competing Protocols

### 5.1 Agent Communication Protocol (ACP) - IBM Research / BeeAI

ACP is a REST-based HTTP protocol from IBM Research and the open-source BeeAI project. Agents expose capability descriptions at build time, communicate via REST, and use MIME-typed messages rather than rigid schemas ([52], [31]). In 2025 the ACP team announced it would merge its work into A2A under the Linux Foundation ([31]).

### 5.2 Agent Network Protocol (ANP)

ANP is an open-source effort focused on **agent-to-agent communication across the open internet** rather than within a single enterprise. It uses decentralized identifiers (DIDs) and JSON-LD for verifiable agent descriptions ([66], ANP repo - GitHub). The project explicitly frames itself as "the HTTP of the agentic web."

### 5.3 NLWeb (Microsoft)

Announced at Build 2025 on **2025-05-19**, **NLWeb** lets any website expose a natural-language interface in a few lines of code. It uses Schema.org and speaks MCP natively, so any NLWeb endpoint can be consumed by an MCP client ([83]).

### 5.4 AG-UI / Agent User Interaction Protocol

AG-UI (Agent-User Interaction Protocol) from CopilotKit is "an open, event-based protocol that standardizes how AI agents connect to user-facing applications" ([5]). It complements MCP by handling the agent-to-frontend layer using Server-Sent Events and JSON event types (`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_*`, etc.) ([91]).

### 5.5 goose (Block)

goose is Block's open-source, extensible AI agent framework that can install, execute, edit, and test code locally. It works with any LLM provider and uses MCP to connect to tools (Block Open Source - codename goose). Block co-developed MCP with Anthropic before the AAIF move ([108]).

### 5.6 Hugging Face smolagents

smolagents is Hugging Face's minimalist Python agent library that supports MCP tool integration out of the box and ships a code-execution agent as the default ([78]).

### 5.7 Microsoft AutoGen

AutoGen is Microsoft's framework for multi-agent applications, originally from Microsoft Research, that supports MCP, multiple model providers, and a code-execution sandbox (AutoGen - Microsoft Research).

---

## 6. Frameworks vs Protocols

Protocols are not the same as frameworks. Frameworks are SDKs developers embed in code; protocols are contracts independent agents use to talk to each other or to tools.

| Framework | Vendor | Key idea | MCP support |
|---|---|---|---|
| **OpenAI Agents SDK** | OpenAI | Agents, tools, handoffs, sessions, tracing | First-class (Servers + Util) |
| **Anthropic Claude Agent SDK** | Anthropic | Claude + Skills, computer use, tools | Native |
| **LangChain / LangGraph** | LangChain Inc. | Graph-based orchestration, ReAct | Via adapter |
| **Microsoft AutoGen** | Microsoft | Multi-agent conversation framework | First-class |
| **Hugging Face smolagents** | Hugging Face | Minimalist code-first agent library | First-class |
| **CrewAI** | CrewAI Inc. | Role-playing multi-agent crews | Via tool adapter |
| **Google ADK** | Google | Agent Development Kit for Gemini | Native |

Sources: [93], AutoGen - Microsoft Research, [78].

---

## 7. Security: The Open Question

Security researchers have flagged MCP as exposing new attack surface because every tool the model can call is a potential untrusted instruction channel:

- Simon Willison, **2025-04-09**: "Model Context Protocol has prompt injection security problems" - demonstrated indirect prompt injection via poisoned tool results ([92]).
- Invariant Labs and other vendors have published tooling to detect and constrain MCP-borne prompt injection ([85]).
- Docker published MCP security best-practices urging sandboxing, least-privilege tools, and provenance checks for MCP servers ([86]).

A2A inherits similar concerns plus the risk of an attacker-controlled remote agent. ACP and ANP both use capability-based / DID-based security as mitigations (ANP repo).

---

## 8. Market Signals and Adoption

- **MCP**: roughly 13,000+ MCP servers in the wild as of April 2026; official registry past 800 ([26]).
- **A2A**: 150+ organizations supporting A2A by April 2026, including AWS, Microsoft, IBM, Salesforce, SAP, ServiceNow, Workday ([29]).
- **AAIF**: 170+ members by June 2026 ([105]).
- **AGENTS.md**: present in 60,000+ repositories ([95]).

---

## 9. Open Questions and Conflicting Evidence

1. **Fragmentation vs. convergence.** Some sources frame MCP and A2A as complementary layers ([35]); others note vendors are racing to ship overlapping standards ([23]). The AAIF merger of MCP and ACP into a single working group under the LF is the clearest signal of convergence.
2. **Single-protocol stack?** Anthropic's framing of MCP as the single integration layer is contested by Google (A2A), IBM (ACP), and Microsoft (NLWeb). Industry commentary in 2025 disagreed on whether MCP is "the USB-C of agents" or one layer of a multi-protocol stack.
3. **Skills vs. tools.** Anthropic's Skills overlap in purpose with traditional "tools" defined in MCP and OpenAI's function-calling. Whether Skills become a standard or remain an Anthropic-specific construct is unresolved; the `agentskills.io` site exists but adoption beyond Claude is unclear.
4. **Security posture.** No MCP or A2A release has shipped with cryptographic identity, capability tokens, or signed tool descriptions by default; this is the single largest open technical question.
5. **Linux Foundation membership conflicts.** Critics have pointed out that competitors in the same LF working group may have governance tensions; the AAIF TSC roster includes AWS, Google, Microsoft, IBM Research, Salesforce, SAP, and ServiceNow ([81]). Whether this leads to slow consensus or rapid convergence is unsettled.

---

## 10. Synthesis

Three distinct protocol "layers" have crystallized in 2024-2025:

- **Tool / context layer** - **MCP** (Anthropic, LF-AAIF): connects a single agent to its tools and data.
- **Capability packaging layer** - **Skills / AGENTS.md** (Anthropic, OpenAI): bundles domain expertise for reuse.
- **Multi-agent collaboration layer** - **A2A, ACP (now merged into A2A), ANP**: lets independent agents discover and cooperate.

Adjacent protocols - **NLWeb** for natural-language websites, **AG-UI** for agent-to-user frontends - cover orthogonal surfaces and are designed to compose with the layers above.

The clearest signal of where this is heading came on 2025-12-09: **MCP, goose, and AGENTS.md all moved into a single Linux Foundation directed fund (the AAIF)** within days of each other. A2A followed in June 2025. The industry is converging on open governance, but it is still racing on wire formats.

For builders, the practical takeaway in mid-2026 is: use **MCP** to wire your agent to tools, write an **A2A Agent Card** if you want other agents to discover your service, and treat **Skills / AGENTS.md** as a lightweight way to ship prompt + script bundles. Keep watching security guidance: every prompt-injection vector in MCP is, by design, a prompt-injection vector in your agent.

---

## References

1. *CopilotKit/CopilotKit: The Frontend Stack for Agents & ...*. https://github.com/CopilotKit/CopilotKit
2. *AG-UI Integration with Agent Framework*. https://learn.microsoft.com/en-us/agent-framework/integrations/ag-ui
3. *AG-UI Is Redefining the Agent–User Interaction Layer | Blog*. https://www.copilotkit.ai/blog/ag-ui-is-redefining-the-agent-user-interaction-layer
4. *Announcing Open Agent Specification support for A2UI ...*. https://blogs.oracle.com/ai-and-datascience/announcing-agent-spec-for-a2ui-copilotkit-ag-ui
5. *AG-UI Protocol*. https://www.copilotkit.ai/ag-ui
6. *Anthropic Agent Skills - Open Source Modular AI Agent ...*. http://agentskill.work/en/skills/anthropics/skills
7. *Claude Agent Skills: A First Principles Deep Dive*. https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive
8. *Katelyn Lesse – Evolving Claude APIs for Agents, Anthropic*. http://app.daily.dev/posts/katelyn-lesse-evolving-claude-apis-for-agents-anthropic-r0veenrdk
9. *LLM Agent & Tool-Use Benchmarks — Function Calling, MCP ...*. https://benchlm.ai/llm-agent-benchmarks
10. *Skills Demo*. http://asymbl.com/video/demo-skills
11. *MCP Moves to the Linux Foundation: What Open Governance Means ...*. https://agentmarketcap.ai/blog/2026/04/08/mcp-linux-foundation-agentic-ai-governance-protocol
12. *MCP Joins Linux Foundation | Mirantis*. https://tfir.io/mcp-linux-foundation-ai-standards-mass-adoption
13. *MCP Foundation 2026: Linux Foundation/AAIF - MCP.Directory*. https://mcp.directory/blog/mcp-foundation-linux-foundation-aaif-2026-explained
14. *MCP and the Linux Foundation: What Vendor-Neutral Governance ...*. https://www.softwareseni.com/mcp-and-the-linux-foundation-what-vendor-neutral-governance-means-for-enterprise-protocol-risk
15. *Model Context Protocol（An open-source protocol released by ...*. https://baike.baidu.com/en/item/Model%20Context%20Protocol/1496197
16. *A2A/docs/specification.md at main · a2aproject/A2A*. https://github.com/a2aproject/A2A/blob/main/docs/specification.md
17. *AgentCard – Agent2Agent Protocol - The A2A Protocol Community*. https://agent2agent.info/docs/concepts/agentcard
18. *Google A2A Protocol in 2026: Adoption, Hype, and Reality*. https://www.glukhov.org/ai-systems/comparisons/a2a-protocol-2026-adoption
19. *A2A Protocol Development Guide | A2A Protocol Documentation*. https://a2aprotocol.ai/docs/guide/a2a-typescript-guide
20. *A2A protocol: Architecture and technical specification*. https://tyk.io/learning-center/a2a-protocol-architecture-and-technical-specification
21. *MCP vs A2A vs ACP — AI Agent Protocols Compared (2026)*. https://www.aimadetools.com/blog/mcp-vs-a2a-vs-acp
22. *MCP vs A2A vs ACP - AI Agent Protocol Comparison 2026*. https://bonjoy.com/articles/mcp-vs-a2a-vs-acp-agent-protocols-compared
23. *Comparison of Agent Protocols MCP, ACP and A2A | Niklas Heidloff*. https://heidloff.net/article/mcp-acp-a2a-agent-protocols
24. *MCP vs A2A vs ACP: Which Agent Protocol Wins in 2026*. https://swarmsignal.net/agent-protocol-comparison-2026
25. *MCP vs A2A vs ACP: The Complete Guide to AI Agent ...*. https://www.aimagicx.com/blog/mcp-vs-a2a-vs-acp-ai-agent-protocols-guide-2026
26. *MCP Server Ecosystem 2026 — 13000+ Servers, Selection ...*. https://www.qcode.cc/en/mcp-servers-ecosystem-2026
27. *MCP Ecosystem in 2026: What Actually Matters | MCP Find*. https://mcp-find.org/blog/mcp-ecosystem-2026
28. *MCP Ecosystem H1 2026 Retrospective: Adoption Data Points*. https://www.digitalapplied.com/blog/mcp-ecosystem-h1-2026-retrospective-adoption-data-points
29. *Google A2A Protocol: How Agent-to-Agent Coordination ...*. https://atlan.com/know/google-a2a-protocol
30. *MCP Server Ecosystem Tracker: 56 Servers Cataloged 2026*. https://www.digitalapplied.com/blog/mcp-server-ecosystem-tracker-50-servers-cataloged-2026
31. *Welcome - Agent Communication Protocol*. https://agentcommunicationprotocol.dev/
32. *acp/README.md at main · i-am-bee/acp · GitHub*. https://github.com/i-am-bee/acp/blob/main/README.md
33. *GitHub - open-webui/openapi-servers: OpenAPI Tool Servers · GitHub*. https://github.com/open-webui/openapi-servers
34. *A2A Protocol*. https://a2a-protocol.org/latest/
35. [
            
            Announcing the Agent2Agent Protocol (A2A)
            
            
            - Google Developers Blog
            
        ](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
36. *Agent Skills - Claude Platform Docs*. https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview
37. *Equipping agents for the real world with Agent Skills \ Anthropic*. https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
38. *Introducing Agent Skills | Claude by Anthropic*. https://www.anthropic.com/news/skills
39. *What is the Model Context Protocol (MCP)?*. https://modelcontextprotocol.io/
40. *Introducing the Model Context Protocol \ Anthropic*. https://www.anthropic.com/news/model-context-protocol
41. *Versioning - Model Context Protocol*. https://spec.modelcontextprotocol.io/
42. *SSE vs Streamable HTTP: Why MCP Switched Transport Protocols*. https://brightdata.com/blog/ai/sse-vs-streamable-http
43. *Streamable HTTP Transport - MCP Fundamentals | Stanza*. https://www.stanza.dev/courses/mcp-fundamentals/transport-layers/mcp-fundamentals-http-transport
44. *Why MCP Deprecated SSE and Went with Streamable HTTP*. https://blog.fka.dev/blog/2025-06-06-why-mcp-deprecated-sse-and-go-with-streamable-http
45. *MCP Server Transports: STDIO, Streamable HTTP & SSE*. https://roocodeinc.github.io/Roo-Code/features/mcp/server-transports
46. *Understanding MCP Server Transports: STDIO, SSE, and HTTP ...*. https://dev.to/zoricic/understanding-mcp-server-transports-stdio-sse-and-http-streamable-5b1p
47. *Google Cloud donates A2A to Linux Foundation*. https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation
48. *Google Donating A2A Protocol to Linux Foundation*. https://dev.to/czmilo/impact-analysis-google-donating-a2a-protocol-to-linux-foundation-3efc
49. *Google Donating A2A Protocol to Linux Foundation*. https://a2aprotocol.ai/blog/impact-analysis-google-donating-a2a-protocol-linux-foundation
50. *A2A Protocol*. https://a2a-protocol.org/latest
51. *A2A: The Agent2Agent Protocol - DeepLearning.AI*. http://deeplearning.ai/courses/a2a-the-agent2agent-protocol
52. *Agent Communication Protocol (ACP) - IBM Research*. https://research.ibm.com/projects/agent-communication-protocol
53. *IBM ACP (Agent Communication Protocol) / BeeAI | a2ac*. https://a2ac.io/projects/acp-beeai
54. [Agent Communication Protocol [AI Agent Knowledge Base]](https://agentwiki.org/agent_communication_protocol)
55. *Agent Communication Protocol (ACP) | Imrul Sheikh*. https://imrul.tech/posts/agent-communication-protocol-acp
56. *An open-source protocol for AI agents to interact - IBM Research*. https://research.ibm.com/blog/agent-communication-protocol-ai
57. *Extend Claude with skills*. http://code.claude.com/docs/en/skills
58. *Equipping agents for the real world with Agent Skills \ Anthropic*. http://anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
59. *Introducing Agent Skills | Claude by Anthropic*. https://claude.com/blog/skills
60. *Agent Skills Overview - Agent Skills*. http://skill.md/
61. *Tools | OpenAI Agents SDK*. https://openai.github.io/openai-agents-js/guides/tools
62. *Tools - OpenAI Agents SDK*. https://openai.github.io/openai-agents-python/tools
63. *Agents SDK | OpenAI API*. https://developers.openai.com/api/docs/guides/agents
64. *Handoffs - OpenAI Agents SDK*. https://openai.github.io/openai-agents-python/handoffs
65. *Function Calling in the OpenAI API*. http://help.openai.com/en/articles/8555517-function-calling-in-the-openai-api
66. *Agent Network Protocol*. https://agent-network-protocol.com/
67. *Agent Network Protocol*. https://aiagentstore.ai/ai-agent/agent-network-protocol
68. *Agent Discovery Protocol: A2A vs ACP vs ANP (2026)*. https://blog.aigrowthagent.co/agent-discovery-protocol-comparison-2026
69. *AgentNetworkProtocol(ANP) is an open source protocol for ...*. https://github.com/agent-network-protocol/AgentNetworkProtocol
70. *DNS-AID: Decentralized AI Agent Discovery Protocol*. https://openflows.org/currency/currents/dns-aid-decentralized-ai-agent-discovery-protocol
71. *ChatGPT plugins*. https://openai.com/index/chatgpt-plugins
72. *NLWeb (Natural Language Web) Overview - YouTube*. https://www.youtube.com/watch?v=nahm6tEPrA4
73. *Using Agentic Protocols (MCP, A2A and NLWeb) | ai-agents-for ...*. https://microsoft.github.io/ai-agents-for-beginners/11-agentic-protocols
74. *NLWeb - Wikipedia*. https://en.wikipedia.org/wiki/NLWeb
75. *Introducing NLWeb: Bringing conversational interfaces ...*. https://news.microsoft.com/source/features/company-news/introducing-nlweb-bringing-conversational-interfaces-directly-to-the-web
76. *Smolagents - Arize AX Docs*. http://arize.com/docs/ax/integrations/python-agent-frameworks/hugging-face-smolagents/smolagents-tracing
77. *Smolagents - MCP Adapt*. https://grll.github.io/mcpadapt/guide/smolagents
78. *smolagents - Hugging Face*. https://huggingface.co/docs/smolagents/v1.11.0/en/index
79. *smolagents*. http://huggingface.co/docs/smolagents/en/index
80. *smolagents · Hugging Face*. https://huggingface.co/docs/smolagents/index
81. [
            
            Google Cloud donates A2A to Linux Foundation
            
            
            - Google Developers Blog
            
        ](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/)
82. *GitHub - i-am-bee/acp: Open protocol for communication between AI agents, applications, and humans. · GitHub*. https://github.com/i-am-bee/acp
83. *Introducing NLWeb: Bringing conversational interfaces directly to the web - Source*. https://news.microsoft.com/source/features/company-news/introducing-nlweb-bringing-conversational-interfaces-directly-to-the-web/
84. *Transports*. https://modelcontextprotocol.io/docs/concepts/transports
85. *Invariant Labs*. https://invariantlabs.ai/blog/mcp-security
86. *Docker Blog | Docker*. https://www.docker.com/blog/mcp-security-best-practices/
87. *Model Context Protocol has prompt injection security problems*. https://simonwillison.net/2025/Apr/9/mcp-prompt-injection
88. *Google Cloud Blog*. https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-agent2agent-protocol-a2a
89. *Quickstart*. https://docs.copilotkit.ai/coagents/quickstart/langgraph
90. *Architecture overview*. https://modelcontextprotocol.io/docs/learn/architecture
91. *Core architecture*. https://docs.ag-ui.com/concepts/architecture
92. *Model Context Protocol has prompt injection security problems*. https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/
93. *OpenAI Agents SDK*. https://openai.github.io/openai-agents-python/
94. *GitHub - agentsmd/agents.md: AGENTS.md — a simple, open format for guiding coding agents · GitHub*. https://github.com/openai/agents.md
95. *AGENTS.md*. https://agents.md/
96. *GitHub - nlweb-ai/NLWeb: Main reference implementation for NLWeb, implemented in Python. · GitHub*. https://github.com/microsoft/NLWeb
97. *Function calling and other API updates - OpenAI*. http://openai.com/index/function-calling-and-other-api-updates
98. *OpenAI introduces function calling for GPT-4 - LessWrong*. https://www.lesswrong.com/posts/cnPeYAefQCtaA5PRa/openai-introduces-function-calling-for-gpt-4
99. *Function Calling*. https://docs.x.ai/developers/tools/function-calling
100. *Improving GPT-4's Function Calling with an Explanation Parameter*. https://pierce-lamb.medium.com/improving-gpt-4-function-calling-with-an-explanation-parameter-4fba06a4c6bb
101. *Linux Foundation Announces the Formation of the Agentic AI Foundation (AAIF), Anchored by New Project Contributions Including Model Context Protocol (MCP), goose and AGENTS.md*. http://linuxfoundation.org/press/linux-foundation-announces-the-formation-agentic-ai-foundation
102. *OpenAI co-founds the Agentic AI Foundation under the Linux Foundation | OpenAI*. http://openai.com/index/agentic-ai-foundation
103. *title: Home - Agentic AI Foundation (AAIF) description: Agentic AI Foundation (AAIF) is the neutral and open foundation built on transparency, collaboration, and standardization to advance the public interest in agentic AI innovation. image: https://aaif.io/wp-content/uploads/2025/12/aaif_soc.png*. http://aaif.io/
104. *Press Releases*. https://www.linuxfoundation.org/press
105. *The Agentic AI Foundation Hit 170 Members in Four ...*. http://beam.ai/es/agentic-insights/aaif-agentic-ai-foundation-170-members-enterprise-adoption
106. *GitHub - aaif-goose/goose: an open source, extensible AI agent that ...*. https://github.com/aaif-goose/goose
107. *Block, Anthropic, and OpenAI Co-Found the Agentic AI ...*. https://shiporskip.io/news/goose-mcp-agents-md-linux-foundation-aaif-agentic-ai-governance-2026
108. *Block - Block rolls out Builderbot, a new suite of AI-native tools that changes the way we ship*. http://block.xyz/inside/block-rolls-out-builderbot-a-new-suite-of-ai-native-tools-that-changes-the-way-we-ship
109. *goose | Your open source AI agent*. http://goose-docs.ai/
110. *Block Open Source Introduces "codename goose"*. http://block.xyz/inside/block-open-source-introduces-codename-goose
111. *MCP Server Registry | Discover & Govern AI Agent Tools  | Kong Inc.*. http://konghq.com/products/mcp-registry
112. *MCP Reached 10,000 Servers and 97M Downloads - Here's Why*. https://virtualassistantva.com/news/anthropic-mcp-10000-servers-ecosystem-standard-march-2026
113. *MCP Registry - Model Context Protocol (MCP)*. http://modelcontextprotocol.info/tools/registry
114. *MCP SDK - Hugging Face*. http://huggingface.co/learn/mcp-course/en/unit1/sdk
