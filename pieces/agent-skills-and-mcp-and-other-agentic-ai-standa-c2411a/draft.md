# The agent standards fight is three fights wearing one jacket

![Whiteboard sketch of the agentic AI standards layers](https://raw.githubusercontent.com/ford-at-home/cozy-core-foundation/4d22b63aa0620de138459ad3d034463e8557dad6/pieces/agent-skills-and-mcp-and-other-agentic-ai-standa-c2411a/assets/agent-skills-and-mcp-and-other-agentic-ai-standa-c2411a-cover.png)

Every agent standards conversation eventually turns into the same slightly exhausting question:

Which one wins?

MCP? A2A? Agent Skills? AGENTS.md? ACP? ANP? Something Microsoft-shaped? Something Google-shaped? Something that shows up next month with a better landing page and a worse acronym?

The question sounds practical. It is not, really.

It turns a stack problem into a horse race.

The better question is less dramatic and much more useful: what layer is this standard trying to cover?

Because the research does not point to one grand protocol swallowing the others. It points to at least three different layers. There is the tool and context layer, where [Anthropic's Model Context Protocol connects AI assistants to the systems where data lives](https://www.anthropic.com/news/model-context-protocol). There is the capability-packaging layer, where [Anthropic's Agent Skills package instructions, scripts, and resources into portable folders](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) and [OpenAI's AGENTS.md gives coding agents repo-local instructions in plain Markdown](https://agents.md/). And there is the multi-agent collaboration layer, where [Google's A2A protocol lets independent agents discover capabilities and coordinate tasks](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/).

Different jobs.

Different failure modes.

Different reasons to care.

## Start with MCP, because MCP absorbed the integration pain first

MCP is the obvious place to start because it solved the pain builders were already feeling.

Before MCP, every new data source tended to mean another bespoke integration. Anthropic named that fragmentation problem directly when it released MCP on 2024-11-25 as ["a new standard for connecting AI assistants to the systems where data lives"](https://www.anthropic.com/news/model-context-protocol). The key move was not glamorous. It put a uniform client-server protocol between the model host and the outside world.

In MCP terms, the host is the LLM application, like a desktop assistant, IDE, or agent framework, and MCP servers expose capabilities through a JSON-RPC interface, according to the [MCP architecture overview](https://modelcontextprotocol.io/docs/learn/architecture). The primitives are also nicely plain: [resources, tools, prompts, sampling, and roots](https://modelcontextprotocol.io/docs/learn/architecture).

That list matters because it tells you what MCP is and what it is not.

MCP is great for giving one agent controlled access to tools and context. It is not, by itself, a social contract between independent agents. A tool call is not a relationship. A resource is not a delegation model. A prompt template is not governance.

This is why the "USB-C for agents" framing works right up until it starts lying to you. If you mean "standard plug for tools and data," fine. The metaphor earns its rent. The ecosystem signal is real enough to pay attention to: one 2026 ecosystem estimate counted roughly [13,000+ MCP servers in the wild and 800+ in the official registry by April 2026](https://www.qcode.cc/en/mcp-servers-ecosystem-2026). I would not build a board deck around that exact count without primary-source confirmation, but the direction is hard to miss.

The governance signal matters too. On 2025-12-09, the Linux Foundation announced the Agentic AI Foundation with founding project contributions including [MCP, Block's goose, and OpenAI's AGENTS.md](http://linuxfoundation.org/press/linux-foundation-announces-the-formation-agentic-ai-foundation). That does not make MCP magically safe or complete. It does reduce the feeling that your integration layer is only a side effect of one vendor's roadmap.

So yes, MCP is probably the default bet for tool and data integration.

Just do not mistake "default bet" for "whole stack."

## Skills are not tools. They are operating manuals with handles.

Agent Skills look deceptively small because the artifact is just a folder.

That is the point.

Anthropic describes Agent Skills as a way to ["build specialized agents using files and folders"](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills). A skill directory contains a `SKILL.md` file with frontmatter, and it can carry supporting scripts, templates, and reference files; the model sees a short description first and loads the fuller instructions only when the skill is invoked, as described in a [first-principles breakdown of Claude Agent Skills](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive).

That is not the same abstraction as an MCP tool.

An MCP tool says: call this function.

A skill says: when the situation looks like this, load this little operating manual, plus whatever files make the manual useful.

One is an interface to capability. The other is packaging for reusable expertise.

AGENTS.md sits nearby, but with almost comic restraint. The [AGENTS.md spec describes itself as "a simple, open format for guiding coding agents"](https://agents.md/), and the [GitHub repository frames it as a plain Markdown convention](https://github.com/openai/agents.md). No negotiation protocol. No runtime handshake. No ornate ceremony. Just: here is how to work in this repo.

That minimalism is easy to underestimate.

A standard can win because it is technically beautiful. It can also win because nobody needs a meeting to adopt it.

The open question is whether Agent Skills becomes a broadly cross-platform convention or stays mostly attached to Claude-shaped workflows. Anthropic says Agent Skills are meant to package agent expertise in portable folders, but independent evidence of adoption outside Anthropic and Claude environments is still thin [Source needed: independent evidence of Agent Skills adoption outside Anthropic/Claude environments].

So the practical stance is simple: use Skills and AGENTS.md for instructions you want agents to reuse. Use MCP for tool access. Do not confuse the two just because both make an agent "more capable."

And definitely do not expect a folder of instructions to solve runtime trust.

## A2A is what happens when your agent has neighbors

MCP answers: how does this agent reach tools?

A2A answers: how does this agent work with another agent without becoming the same agent?

Google announced A2A on 2025-04-09 with [more than 50 launch partners](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/). The design goal is not to expose every internal tool or chain-of-thought-shaped secret. It is to let opaque agents describe capabilities, accept work, stream progress, ask for input, and return artifacts.

The [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) centers on Agent Cards, tasks, messages, parts, artifacts, streaming, and push notifications. The Agent Card is the important social object. It is the thing another system can discover to learn what an agent claims it can do, what modalities it supports, and what authentication it requires, according to the [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md).

That is a different layer from MCP.

Google is explicit about this boundary: [A2A is for agent-to-agent interoperability while MCP connects agents to tools and data](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/). Good. Keep that line bright.

The governance story moved quickly here too. Google donated A2A to the Linux Foundation on 2025-06-23, and the donation announcement says A2A would be governed with a technical steering committee including representatives from [AWS, Cisco, Google, IBM Research, Microsoft, Salesforce, SAP, and ServiceNow](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/).

That is either a convergence signal or a committee-shaped warning light.

Probably both.

## A boring stack sketch

Here is what this looks like in a real architecture, stripped of the standards theater.

Say you are building an internal engineering agent. It needs to read tickets, inspect repos, run safe diagnostics, and hand off specialized work to another service.

Use MCP for the tool and context surface: ticket search, repo reads, CI logs, database-safe queries, maybe a sandboxed diagnostics server. The reason is straightforward: MCP already defines the host/server shape and the [resources, tools, prompts, sampling, and roots](https://modelcontextprotocol.io/docs/learn/architecture) vocabulary.

Use AGENTS.md or Skills for the reusable working knowledge: how this repo is tested, how deploys happen, what "safe diagnostics" means, what files are off-limits, what review checklist should load before a change ships. That is not tool access. That is local expertise with a handle, which is exactly the territory covered by [AGENTS.md](https://agents.md/) and [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills).

Use A2A only when another agent needs to discover or coordinate with this one. Publish an Agent Card if the service should be discoverable as an agent, because [A2A's Agent Card describes identity, capabilities, skills, authentication requirements, and supported modalities](https://github.com/a2aproject/A2A/blob/main/docs/specification.md).

That is the shape:

- MCP for tools and context.
- Skills or AGENTS.md for reusable operating knowledge.
- A2A for collaboration between independent agents.

Not one winner.

Layer boundaries.

## The adjacent protocols are not noise if you put them in the right drawer

The rest of the standards landscape looks messier than it is because people keep throwing every protocol into the same drawer.

ACP, from IBM Research and BeeAI, is a REST-based agent communication protocol; its own site now says the project is working toward [alignment with A2A](https://agentcommunicationprotocol.dev/), and IBM describes ACP as an [open protocol for AI agents to interact](https://research.ibm.com/projects/agent-communication-protocol). ANP is more internet-native and identity-flavored, using decentralized identifiers and JSON-LD according to the [Agent Network Protocol project](https://agent-network-protocol.com/) and its [GitHub repository](https://github.com/agent-network-protocol/AgentNetworkProtocol).

NLWeb belongs in a different drawer. Microsoft introduced NLWeb as a way to bring [conversational interfaces directly to websites](https://news.microsoft.com/source/features/company-news/introducing-nlweb-bringing-conversational-interfaces-directly-to-the-web/), and the research notes that NLWeb speaks MCP natively through Microsoft's published framing of agentic protocols [Source needed: primary-source confirmation for the exact current NLWeb-to-MCP default posture].

AG-UI is another different drawer. The [AG-UI protocol](https://www.copilotkit.ai/ag-ui) standardizes the event stream between agents and user-facing applications, and its [core architecture docs](https://docs.ag-ui.com/concepts/architecture) describe event types for runs, text messages, and tool calls.

This is where builders can save themselves a lot of architecture theater.

If you are wiring tools, think MCP. If you are packaging reusable agent know-how, think Skills and AGENTS.md. If you need independent agents to discover and coordinate with each other, think A2A. If your website needs a natural-language surface, NLWeb may be the relevant layer. If your frontend needs to render agent progress and tool calls, AG-UI may be the relevant layer.

One protocol does not need to eat all the others for the map to be useful.

## The security problem is not a footnote

Here is the part that should make everybody slow down.

MCP gives agents access to tools and data. That is why it is useful. It is also why the attack surface gets weird.

Simon Willison wrote in April 2025 that the [Model Context Protocol has prompt injection security problems](https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/), showing how poisoned tool results can become indirect instructions to the model. Invariant Labs has published work on [MCP security and prompt-injection exposure](https://invariantlabs.ai/blog/mcp-security), and Docker's guidance urges [sandboxing, least privilege, and provenance checks for MCP servers](https://www.docker.com/blog/mcp-security-best-practices/).

This is not an argument against MCP.

It is an argument against pretending "standardized" means "safe."

A2A inherits the same basic anxiety and adds a new one: the other agent may be remote and opaque, which is part of the design goal Google described when it framed A2A around [agents communicating as opaque peers](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/). ANP's DID-based framing and ACP's capability-oriented language are attempts to push identity and capability into the conversation, but the research is thin on what is deployed by default across MCP and A2A implementations [Source needed: current default identity, capability-token, and signed-description posture for MCP and A2A implementations].

The boring security advice is probably the right advice. Treat every tool response as untrusted input. Give servers the smallest useful permissions. Prefer sandboxed execution. Track provenance. Make user approval real instead of decorative.

The less boring version is this:

Every integration standard for agents is also an instruction-injection standard if you wire it lazily.

## The builder move is adoption by layer

The standards are converging, but not into one protocol.

They are converging into a map.

MCP is the default bet for tool and data integration because it has the strongest visible ecosystem signal and a vendor-neutral governance story through the [Agentic AI Foundation](http://linuxfoundation.org/press/linux-foundation-announces-the-formation-agentic-ai-foundation). A2A is the serious bet for agent collaboration because Google launched it with enterprise partners and then [donated it to the Linux Foundation](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/). Skills and AGENTS.md are worth treating as the lightweight packaging layer because [Agent Skills are portable folders of agent expertise](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) and [AGENTS.md is intentionally just Markdown guidance for coding agents](https://agents.md/).

That is the stack I would try first:

- Use MCP when the agent needs tools or data.
- Use Skills or AGENTS.md when the agent needs reusable working knowledge.
- Use A2A when the agent needs to be discoverable by, or collaborate with, other agents.
- Use NLWeb or AG-UI only when their surface is actually your surface.
- Treat security as architecture, not cleanup.

Stop looking for the one standard that wins.

Look for the layer that is trying to stop hurting.
