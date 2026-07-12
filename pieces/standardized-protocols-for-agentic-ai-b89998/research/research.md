---
source: parallel-deep-research
query: "Standardized protocols for agentic AI"
processor: ultra-fast
run_id: trun_3cad0ebea15c480ea997c2757dbb64a0
date: "2026-07-12T09:29:25.646Z"
---

# Standardized Protocols for Agentic AI

## Executive Summary

In 2024-2026 the agentic-AI ecosystem moved from bespoke, single-vendor tool wiring to a stack of open protocols. Six efforts now define how language-model agents connect to tools, discover each other, exchange tasks, and run inside enterprises:

- **Model Context Protocol (MCP)** - Anthropic, released **November 25, 2024** as the de-facto "USB-C for tools"; donated to the Linux Foundation's new **Agentic AI Foundation (AAIF)** on **December 9, 2025** alongside OpenAI and Block ([23]; [50]).
- **Agent2Agent (A2A)** - Google, launched **April 9, 2025** with **50+ launch partners** including Atlassian, Salesforce, SAP, ServiceNow, Workday, MongoDB, PayPal, LangChain, and the major consultancies ([25]). IBM's competing **Agent Communication Protocol (ACP)** merged into A2A under the Linux Foundation.
- **Agent Network Protocol (ANP)** - open-source, decentralized alternative using W3C **DIDs** and **JSON-LD**, modeled after the web's hyperlink architecture ([6]).
- **AGNTCY** - Cisco-led "Internet of Agents" stack donated to the Linux Foundation on **July 29, 2025**, with the **SLIM** messaging layer, **AgentFacts** identity cards, and an **Agent Directory** ([30]).
- **Standards-body work** - IEEE **P3709** (Framework and Technical Requirements of Agentic AI), **P7022** (Trustworthy Generative/Agentic AI in Enterprise Applications), and **P7804** (Agentic AI for school food-waste logistics); W3C **AI Agent Protocol Community Group** chartered to explore an open agent-interaction standard ([85]; [45]).
- **Vendor tool-calling specs** - OpenAI's **function calling / Tools API** (JSON-schema-typed), Anthropic's **Skills** (folder-based `SKILL.md` assets) ([95]).

**Three tensions to watch.** First, **MCP vs. A2A** is largely orthogonal (MCP is agent-to-tool, A2A is agent-to-agent), but vendors have positioned them as competitors, accelerating a "walled-garden vs. open" framing. Second, **IBM's ACP merged into A2A** under the Linux Foundation, signaling consolidation around Google's protocol - though the A2A spec continues to evolve. Third, **security** is the weakest layer: OWASP now publishes an MCP-specific cheat sheet covering tool-poisoning and rug-pull attacks ([57]).

---

## 1. Why Agentic-AI Protocols Now Exist

Until 2024, every agent framework (LangChain, AutoGen, CrewAI) hand-rolled its own tool-calling and inter-agent message formats. The brittleness became visible as soon as enterprises tried to compose agents built on different stacks, models, and vendors.

Three pressures converged to make 2024-2025 the inflection point:

1. **Tool explosion.** Agents need hundreds of integrations (databases, SaaS APIs, file systems, browsers). Point-to-point wiring does not scale.
2. **Multi-agent workflows.** Enterprises want agents from different vendors (CRM agent, ERP agent, analyst agent) to hand off tasks without bespoke glue.
3. **Lock-in anxiety.** Customers feared being trapped by a single vendor's agent runtime, mirroring the pre-USB peripheral wars.

The response was a Cambrian explosion of open protocols - most modeled after well-understood web primitives (JSON-RPC, REST, hyperlinks, DID).

---

## 2. The Protocol Stack (Layered View)

| Layer | Purpose | Leading Protocols |
|---|---|---|
| Identity | Who is this agent? | W3C DID, AGNTCY AgentFacts (OIDC-backed) |
| Capability discovery | What can it do? | A2A Agent Cards, ANP Agent Description, MCP server manifests |
| Tool / context invocation | Call tools/data with consent | **MCP**, OpenAPI, function calling |
| Agent-to-agent task exchange | Hand off tasks, stream results | **A2A**, ACP (now merged), ANP |
| Messaging transport | Move JSON over the wire | HTTPS, gRPC, AGNTCY **SLIM** (Secure Low-latency Interactive Messaging) |
| Governance / standards | Normative specs | IEEE P3709, IEEE P7022, W3C CG, Linux Foundation AAIF |

Most stacks now treat MCP and A2A as **complementary layers** of the same architecture rather than competing replacements.

---

## 3. Model Context Protocol (MCP) - Anthropic / Linux Foundation

### Origin and governance

- **Released**: November 25, 2024 by Anthropic ([23]).
- **Donated to AAIF**: December 9, 2025, alongside Anthropic's **goose** (agent framework) and OpenAI's **AGENTS.md** ([50]).
- **Spec maintained at**: `modelcontextprotocol.io` (now part of the AAIF project set).
- **Founding contributors**: Anthropic, OpenAI, Block (AAIF charter).

### Architecture

MCP follows a strict **client-host-server** model with JSON-RPC 2.0 messaging ([22]):

- **MCP server**: Exposes three primitive types - `resources` (read-only data), `tools` (executable actions), `prompts` (templated instructions).
- **MCP client**: Embedded in the host application (e.g., Claude Desktop, an IDE plugin, or a runtime like LangChain).
- **Transport**: stdio for local processes; Streamable HTTP + SSE for remote.

### Adoption signals

- **OpenAI** added MCP support to the Agents SDK and ChatGPT desktop app in 2025 ([69]).
- **Microsoft Azure** documented MCP servers as the integration fabric for Foundry agents ([66]).
- **LangChain** ships a dedicated adapter library (`langchain-mcp-adapters`) ([75]).
- **Community MCP servers** surpassed 7,000 publicly listed by mid-2026 ([89]).
- A reference **MCP registry** provides authoritative discovery at `registry.modelcontextprotocol.io` (MCP registry).

### Strategic significance

MCP is the closest thing the agent ecosystem has to a TCP/IP moment: a thin, well-defined contract between an LLM and *anything external*. Its donation to a neutral foundation in late 2025 - with OpenAI as a co-founder - defused the "Anthropic-only" critique that persisted through 2025.

---

## 4. Agent2Agent (A2A) - Google / Linux Foundation

### Launch and partners

- **Launched**: April 9, 2025 by Google with **50+ launch partners** spanning SaaS, data, and system integrators ([25]). Named partners include Atlassian, Box, Cohere, Intuit, LangChain, MongoDB, PayPal, Salesforce, SAP, ServiceNow, UKG, Workday; consultancies Accenture, BCG, Capgemini, Cognizant, Deloitte, HCLTech, Infosys, KPMG, McKinsey, PwC, TCS, and Wipro.
- **Transfer to LF**: A2A was contributed to the Linux Foundation in 2025; ACP (IBM's REST-based alternative) was merged into A2A under the same foundation governance ([2]).

### Technical design

A2A is built on **JSON-RPC 2.0 over HTTP(S)** with SSE for streaming ([87]). Core objects:

- **Agent Card** (JSON metadata document): identity, capabilities, skills, supported modalities, authentication requirements.
- **Task**: the unit of work; has a lifecycle (submitted -> working -> input-required -> completed/failed/canceled).
- **Artifact**: any output produced by an agent (file, structured data, UI form).
- **Message / Part**: the carrier of user content inside a task.

### Complementary to MCP

Google explicitly positioned A2A as **complementary** to MCP - A2A handles opaque agent-to-agent collaboration; MCP handles agent-to-tool grounding. The two protocols use different primitives (tasks vs. resources/tools) and address different layers of the stack.

---

## 5. Agent Network Protocol (ANP) - Decentralized Web

### Vision

ANP positions itself as the "HTTP of the agentic era" - a decentralized, web-scale protocol where every agent is addressable by a **W3C DID** and metadata is published in JSON-LD ([24]).

### Three-layer architecture

1. **Identity & Encryption Layer**: W3C DID for agent identities, end-to-end encryption.
2. **Meta-Protocol Layer**: negotiation of capabilities and protocols between agents (similar to ALPN in TLS).
3. **Agent Protocol Layer**: the actual JSON-RPC interaction interface.

### Strategic positioning

ANP is the strongest of the protocols on **cross-organization** discovery and trust - it does not require a central registry. Its weakness is ecosystem gravity: it has a much smaller partner set than A2A or MCP.

---

## 6. IBM Agent Communication Protocol (ACP) - Now Merged

- **Launched**: March 2025 by IBM Research as a lightweight, REST-native alternative to A2A ([2]).
- **Status**: ACP was contributed to the Linux Foundation and **merged into A2A** to avoid fragmentation (ACP migration guide).
- **Why it matters**: ACP proved the demand for a simpler, REST-friendly spec; its merger into A2A is the cleanest case study so far of competing protocols consolidating.

---

## 7. AGNTCY - The "Internet of Agents"

AGNTCY (originally Cisco's "Open Agentic Internet" project) is best understood as a **stack of protocols**, not a single one.

| Component | Function |
|---|---|
| **SLIM** (Secure Low-latency Interactive Messaging) | Transport optimized for agent pub/sub |
| **AgentFacts** | Identity document (OIDC-backed) |
| **Agent Directory** | Decentralized registry of agents |
| **OIDC Gateway** | Policy-based authorization for agent calls |

AGNTCY was donated to the Linux Foundation on **July 29, 2025** ([30]).

### Positioning vs. A2A / MCP

AGNTCY's SLIM is broadly compared to Google's A2A - both target inter-agent communication - but AGNTCY takes a more **infrastructure-centric** approach (transport, identity, discovery) while A2A focuses on the application-level message format. Critics note this overlap; supporters argue SLIM is more performant at the wire level.

---

## 8. OpenAI's Tools / Function Calling

OpenAI never formalized a standalone open protocol, instead shipping:

- **Function calling** (June 2023) and **Tools API** - JSON-Schema-typed parameters, returned as structured tool calls ([39]).
- **Agents SDK** (March 2025) - runtime + tracing + handoffs ([37]).
- **MCP support** added to the Agents SDK in 2025, signaling that OpenAI treats MCP as the cross-vendor tool standard even where its proprietary format still exists.

The pattern: OpenAI keeps **proprietary runtime semantics** but adopts **open wire protocols** for interoperability.

---

## 9. Agent Skills - Anthropic (2025)

Anthropic introduced **Skills** in 2025: folders of `SKILL.md` files plus assets (scripts, templates) that an agent loads on demand ([95]). Skills are *not* a network protocol - they are a packaging convention for *teaching* an agent a capability. They live alongside MCP rather than competing with it: MCP servers expose *tools*; Skills expose *know-how*.

---

## 10. Standards Bodies and Formal Standards Work

| Body | Project | Scope |
|---|---|---|
| **IEEE SA** | **P3709** | Standard for Framework and Technical Requirements of Agentic AI ([83]) |
| IEEE SA | **P7022** | Standard for Requirements and Evaluation Criteria for Trustworthy Generative and Agentic AI in Enterprise Applications ([84]) |
| IEEE SA | **P7804** | Recommended Practice for Agentic AI in School Food-Waste Logistics ([86]) |
| **W3C** | **AI Agent Protocol Community Group** | Drafting "Agent Network Protocol" whitepaper and an open agent-interaction standard ([45]) |
| **IETF / IRTF** | None formal yet | Discussion lists have noted the gap; draft charters circulate informally. |
| **Linux Foundation** | **Agentic AI Foundation (AAIF)** | Houses MCP, A2A, goose, AGENTS.md since Dec 2025. |

The W3C Community Group's published white paper is non-normative but signals that a Recommendation-Track Working Group becomes plausible in 2027.

---

## 11. Framework Integrations (as of mid-2026)

| Framework | MCP | A2A | ANP | ACP |
|---|---|---|---|---|
| **LangChain / LangGraph** | Native (`langchain-mcp-adapters`) | Native | Experimental | Via MCP layer |
| **CrewAI** | Supported | Supported | - | - |
| **AutoGen (Microsoft)** | Supported | Supported | - | - |
| **OpenAI Agents SDK** | Native | - | - | - |
| **Google ADK** | Native | Native (first-party) | - | - |
| **BeeAI (IBM)** | Supported | Now via A2A | - | Original |

Sources: framework documentation pages linked above; ecosystem analyses ([89], [92]).

---

## 12. Tensions, Open Questions, and Conflicting Evidence

1. **"MCP vs. A2A" framing is mostly false.** Google, Anthropic, and most analysts now agree they are complementary layers. The framing was a 2025 marketing artifact; the technical reality is stack composition.

2. **ACP merger into A2A.** IBM Research confirmed the merger in 2025 under the Linux Foundation; however, A2A's spec language still references ACP-style REST semantics in places. Some practitioners report the migration guide is incomplete (ACP repo).

3. **MCP security is immature.** OWASP formally tracks MCP-specific threats: tool poisoning, prompt injection via tool descriptions, rug-pull attacks (changing tool behavior after approval), and overbroad permissions ([57]). The protocol has no native auth model beyond the underlying transport.

4. **A2A's enterprise penetration is unverified.** Google's launch-partner list is large, but production deployments outside Google Cloud are sparse as of mid-2026. Conflicting evidence: vendor blogs claim rapid adoption; independent audits have not been published.

5. **ANP vs. centralized registries.** ANP's decentralized DID model is philosophically attractive but requires W3C DID infrastructure that enterprises often lack. Most pilots fall back to a centralized directory, undermining ANP's core differentiator.

6. **Skill vs. Tool ambiguity.** Anthropic's Skills and MCP's tools solve overlapping problems. Skills are *static, packaged knowledge*; tools are *dynamic, callable functions*. The boundary blurs when a Skill contains executable code.

7. **Standardization timing.** None of these protocols are ISO, IEEE, or IETF standards. The Linux Foundation's AAIF is the closest thing to a neutral governance body, but it depends on corporate sponsorship.

---

## 13. What to Watch in 2026-2027

- **AAIF project expansion.** The Linux Foundation's Agentic AI Foundation is the likeliest venue for protocol convergence; watch for new project contributions beyond MCP/goose/AGENTS.md.
- **IEEE P3709 publication.** The first IEEE agentic-AI standard is expected to publish a draft in 2026; it will be the most influential formal-spec reference.
- **A2A v2 / streaming.** The A2A working group has signaled richer streaming, push notifications, and richer multimodal artifacts in the next major version.
- **MCP security extensions.** Expect proposals for OAuth-bound MCP servers, tool-signing, and provenance metadata - all currently community drafts.
- **W3C CG -> WG transition.** If the W3C AI Agent Protocol Community Group produces a stable draft, a Recommendation-Track Working Group becomes plausible in 2027.

---

## 14. Bottom Line

The protocol landscape for agentic AI in 2026 has consolidated around three open standards:

1. **MCP** - the universal tool-call protocol (analogous to USB-C).
2. **A2A** - the universal agent-to-agent task protocol (analogous to SMTP for agents).
3. **ANP / AGNTCY** - infrastructure-layer alternatives for decentralized, cross-organization scenarios where A2A's centralization is undesirable.

Proprietary formats (OpenAI function-calling, Anthropic Skills) remain important but increasingly run *over* MCP rather than *against* it. The biggest unresolved risk is not protocol design but **security model maturity** - particularly for MCP, which today has no native authentication or authorization layer beyond the underlying transport.

---

## References

1. *What is Agent Communication Protocol (ACP)? - IBM*. https://www.ibm.com/think/topics/agent-communication-protocol
2. *Agent Communication Protocol (ACP) - IBM Research*. https://research.ibm.com/projects/agent-communication-protocol
3. *Using ACP for AI Agent Interoperability: Building Multi ...*. https://www.ibm.com/think/tutorials/acp-ai-agent-interoperability-building-multi-agent-workflows
4. *IBM ACP (Agent Communication Protocol) / BeeAI | a2ac*. https://a2ac.io/projects/acp-beeai
5. *Agent-to-Agent Interoperability Protocols: A2A, ACP, and ANP ...*. https://zylos.ai/research/2026-04-18-agent-to-agent-interoperability-protocols
6. *ANP-Agent Discovery Protocol Specification | Agent Network ...*. https://agent-network-protocol.com/specs/1.1/agent-discovery
7. *AgentNetworkProtocol/08-ANP-Agent-Discovery-Protocol ... - GitHub*. https://github.com/agent-network-protocol/AgentNetworkProtocol/blob/main/08-ANP-Agent-Discovery-Protocol-Specification.md
8. *The Agent Network Protocol (ANP): A Decentralized ...*. https://promiseresearch.web3ium.space/the-agent-network-protocol-anp-a-decentralized-communication-substrate-for-autonomous-ai-agents
9. *DID Implementation | agent-network-protocol/anp-agent ...*. https://deepwiki.com/agent-network-protocol/anp-agent-openchat/6.4-did-implementation
10. *Agent Discovery Protocol | agent-network-protocol ...*. https://deepwiki.com/agent-network-protocol/AgentNetworkProtocol/4.2-agent-discovery-protocol
11. *Model Context Protocol（An open-source protocol released by ...*. https://baike.baidu.com/en/item/Model%20Context%20Protocol/1496197
12. *MCP Registry – Model Context Protocol （MCP）*. https://modelcontextprotocol.info/tools/registry
13. *modelcontextprotocol/registry: A community driven ...*. http://github.com/modelcontextprotocol/registry
14. *Official MCP Registry*. http://registry.modelcontextprotocol.io/
15. *Open-Source MCP Servers*. http://glama.ai/mcp/servers
16. *A2A Protocol | Reactive Agents*. https://docs.reactiveagents.dev/features/a2a-protocol
17. *A2A Protocol Specification (Python)*. https://a2aprotocol.ai/docs/guide/a2a-protocol-specification-python
18. *A2A Protocol Development Guide | A2A Protocol Documentation*. https://a2aprotocol.ai/docs/guide/a2a-typescript-guide
19. *A2A/docs/specification.md at main · a2aproject/A2A*. https://github.com/a2aproject/A2A/blob/main/docs/specification.md
20. *Google A2A Protocol: How Agent-to-Agent Coordination Works - Atlan*. https://atlan.com/know/google-a2a-protocol
21. *What is the Model Context Protocol (MCP)?*. https://modelcontextprotocol.io/
22. *Specification*. https://modelcontextprotocol.io/specification/2025-06-18
23. *Introducing the Model Context Protocol \ Anthropic*. https://www.anthropic.com/news/model-context-protocol
24. *GitHub - agent-network-protocol/AgentNetworkProtocol: AgentNetworkProtocol(ANP) is an open source protocol for agent communication. Our vision is to define how agents connect with each other, building an open, secure, and efficient collaboration network for billions of intelligent agents. · GitHub*. https://github.com/agent-network-protocol/AgentNetworkProtocol
25. [
            
            Announcing the Agent2Agent Protocol (A2A)
            
            
            - Google Developers Blog
            
        ](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/)
26. *A2A Protocol*. https://a2a-protocol.org/
27. *AGNTCY - GitHub*. https://github.com/agntcy
28. *CISCO Gifts AGNTCY Project to Linux Foundation to Standardize ...*. https://itsfoss.com/news/agntcy-project-joins-linux-foundation
29. *AGNTCY | Ry Walker Research*. https://rywalker.com/research/agntcy
30. *AGNTCY project donated to Linux Foundation with major ...*. https://outshift.cisco.com/blog/ai-ml/agntcy-donated-to-linux-foundation
31. *Cisco donates AI agent tech to Linux Foundation | Network World*. http://networkworld.com/article/4029803/cisco-donates-ai-agent-tech-to-linux-foundation.html
32. *IEEE AI Standards for Agentic Systems*. https://ieeexplore.ieee.org/document/11050630
33. [[PDF] IEEE SA Input_NIST AI Risk Management Framework](https://www.nist.gov/document/ai-rmf-rfi-comments-ieee-standards-association)
34. *IEEE Standards Association Announces Joint Specification V1.0 for ...*. https://www.businesswire.com/news/home/20241121004468/en/IEEE-Standards-Association-Announces-Joint-Specification-V1.0-for-the-Assessment-of-the-Trustworthiness-of-AI-Systems
35. *IEEE Standards Association AI — Governance Consortium (Est. 2016)*. https://aisecurityandsafety.org/en/organizations/ieee-sa-ai
36. *P3225.01 - IEEE SA*. https://standards.ieee.org/ieee/3225.01/12041
37. *OpenAI Launches New API, SDK, and Tools to Develop ...*. https://www.infoq.com/news/2025/03/openai-responses-api-agents-sdk
38. *Tools - OpenAI Agents SDK*. http://openai.github.io/openai-agents-python/tools
39. *Function calling | OpenAI API*. https://developers.openai.com/api/docs/guides/function-calling
40. *Agents SDK | OpenAI API*. https://developers.openai.com/api/docs/guides/agents
41. *OpenAI Agents SDK*. https://openai.github.io/openai-agents-python
42. *Agent Network Protocol White Paper - GitHub Pages*. https://w3c-cg.github.io/ai-agent-protocol
43. *AI Agent Protocols 2026: Complete Guide*. https://www.ruh.ai/blogs/ai-agent-protocols-2026-complete-guide
44. *Protocol(Tentative)*. https://w3c-cg.github.io/ai-agent-protocol/protocol.html
45. *AI Agent Protocol | Community Groups - W3C*. https://www.w3.org/groups/cg/agentprotocol
46. *AI Agent Protocol Community Group - W3C*. https://www.w3.org/community/agentprotocol
47. *Agent Network Protocol White Paper*. https://w3c-cg.github.io/ai-agent-protocol/
48. *Google A2A Protocol: How Agent-to-Agent Coordination Works*. https://atlan.com/know/google-a2a-protocol/
49. *MCP: Created by Anthropic, Donated to AAIF (Linux Foundation*. https://parallect.ai/reports/mcp-anthropic-donation-aaif-linux-foundation-436537
50. *Linux Foundation Announces the Formation of the Agentic AI ...*. https://www.linuxfoundation.org/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation
51. *Linux Foundation Announces the Formation of the Agentic AI ...*. https://aaif.io/press/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation-aaif-anchored-by-new-project-contributions-including-model-context-protocol-mcp-goose-and-agents-md
52. *Linux Foundation Announces the Formation of the Agentic AI ...*. https://www.prnewswire.com/news-releases/linux-foundation-announces-the-formation-of-the-agentic-ai-foundation-aaif-anchored-by-new-project-contributions-including-model-context-protocol-mcp-goose-and-agentsmd-302636897.html
53. *Linux Foundation Agentic AI: MCP Governance Shifts in 2026*. https://tokenmix.ai/blog/agentic-ai-foundation-linux-mcp-2026
54. *MCP Security Risks: Tool Poisoning, Prompt Injection, and the ...*. https://ismalicious.com/posts/mcp-security-risks-tool-poisoning-ai-agents
55. *MCP Security Guide 2026: Risks, Prompt Injection and Safe ...*. https://baeseokjae.github.io/posts/mcp-security-guide-2026
56. *Prompt Injection in MCP Servers: Risks, Examples, and ...*. https://mindgard.ai/blog/how-to-secure-mcp-servers-against-prompt-injection-attacks
57. *MCP Security - OWASP Cheat Sheet Series*. https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html
58. *MCP Security: How to Stop Prompt Injection Attacks*. https://datadome.co/agent-trust-management/mcp-security-prompt-injection-prevention
59. *Cloudflare Agents Integration*. https://www.assistant-ui.com/docs/integrations/frameworks/cloudflare-agents/overview
60. *Cloudflare Agents docs*. https://developers.cloudflare.com/agents
61. *Cloudflare Agents*. https://agents.cloudflare.com/
62. *Cloudflare Ships Agent Skills for Zero Trust Deployment ...*. https://www.infoq.com/news/2026/06/cloudflare-one-stack-agents
63. *Making Cloudflare the best platform for building AI Agents*. https://blog.cloudflare.com/build-ai-agents-on-cloudflare
64. *Decoding Agent-Core. AWS released Amazon Bedrock AgentCore… | by Meenakshisundaram Thandavarayan | Medium*. http://meenakshisundaram-t.medium.com/decoding-agent-core-f85a16b07d9e
65. *Azure AI Foundry for Enterprise Multi-Agent Orchestration*. https://windowsforum.com/threads/agent-factory-blueprint-azure-ai-foundry-for-enterprise-multi-agent-orchestration.382043
66. *azure-ai-docs/articles/foundry/agents/how-to/tools/model ...*. https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/foundry/agents/how-to/tools/model-context-protocol.md
67. *Amazon Bedrock AgentCore Documentation*. https://www.amazon.com/bedrock-agentcore
68. *Inside the Agent Stack: Securing Agents in Amazon Bedrock AgentCore*. http://zenity.io/blog/research/inside-the-agent-stack-securing-agents-in-amazon-bedrock-agentcore
69. *Tools - OpenAI Agents SDK*. https://openai.github.io/openai-agents-python/tools
70. *How can I use function calling with response format ...*. https://community.openai.com/t/how-can-i-use-function-calling-with-response-format-structured-output-feature-for-final-response/965784
71. *OpenAI Agents SDK - GitHub Pages*. https://openai.github.io/openai-agents-python/agents
72. *OpenAI Agents SDK Deep Dive: Agents, Tools, Handoffs, and ...*. https://callsphere.ai/blog/openai-agents-sdk-deep-dive-agents-tools-handoffs-guardrails-2026
73. *The open source, multi-agent platform*. http://crewai.com/open-source
74. *AI Agent Framework Releases February 2026: CrewAI A2A, OpenAI ...*. https://www.paperclipped.de/en/blog/ai-agent-framework-releases-february-2026
75. *Model Context Protocol (MCP) - Docs by LangChain*. https://docs.langchain.com/oss/python/langchain/mcp
76. *Integration with LangChain and LangGraph | langchain-ai ...*. https://deepwiki.com/langchain-ai/langchain-mcp-adapters/5-integration-with-langchain-and-langgraph
77. *A2A MCP AG2 Intelligent Agent Example | A2A Protocol ...*. https://a2aprotocol.ai/docs/guide/a2a-mcp-ag2-sample
78. *FIPA ACL: Standardized Agent Communication Language*. https://inferensys.com/glossary/multi-agent-system-orchestration/agent-communication-protocols/fipa-acl
79. *Knowledge Query and Manipulation Language - HandWiki*. https://handwiki.org/wiki/Knowledge_Query_and_Manipulation_Language
80. *An Introduction to FIPA Agent Communication Language ...*. https://smythos.com/developers/agent-development/fipa-agent-communication-language
81. *FIPA ACL: Agent Communication Language Standard*. https://inferensys.com/glossary/multi-agent-system-orchestration/agent-negotiation-protocols/fipa-acl-agent-communication-language
82. *Knowledge Query and Manipulation Language - Public Domain ...*. https://pdkb.org/wiki/index.php/Knowledge_Query_and_Manipulation_Language
83. *IEEE SA - P3709*. https://standards.ieee.org/ieee/3709/12159
84. *IEEE SA - P7022*. https://standards.ieee.org/ieee/7022/12533
85. *Active PARs*. https://sagroups.ieee.org/ai-sc/active-pars
86. *IEEE SA - P7804*. https://standards.ieee.org/ieee/7804/12426
87. *A2A Protocol - Agent2Agent(A2A) Protocol Resources*. https://a2aprotocol.org/
88. *2026: The Year for Enterprise-Ready MCP Adoption - CData Software*. https://www.cdata.com/blog/2026-year-enterprise-ready-mcp-adoption
89. *The MCP Ecosystem in 2025: How Model Context Protocol is ...*. https://knowmine.ai/en/blog/mcp-ecosystem-ai-tool-chain
90. *MCP Server Ecosystem Statistics 2026 - Presenc AI*. https://presenc.ai/research/mcp-server-ecosystem-statistics-2026
91. *MCP Adoption Statistics 2026*. https://mcpmanager.ai/blog/mcp-adoption-statistics
92. *Native Support for A2A Protocol - LangGraph LangChain Forum https://forum.langchain.com › ... › LangGraph*. https://forum.langchain.com/t/native-support-for-a2a-protocol/1302
93. *FIPA ACL Message Structure Specification*. https://www.fipa.org/specs/fipa00061/SC00061G.html
94. *OpenAPI Specification v3.1.0*. https://spec.openapis.org/oas/v3.1.0
95. *Introducing Agent Skills | Claude by Anthropic*. https://www.anthropic.com/news/skills
