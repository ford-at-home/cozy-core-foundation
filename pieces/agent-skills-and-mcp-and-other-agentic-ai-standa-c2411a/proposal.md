# The agent standards fight is three fights wearing one jacket

![Whiteboard sketch of the agentic AI standards layers](https://raw.githubusercontent.com/ford-at-home/cozy-core-foundation/4d22b63aa0620de138459ad3d034463e8557dad6/pieces/agent-skills-and-mcp-and-other-agentic-ai-standa-c2411a/assets/agent-skills-and-mcp-and-other-agentic-ai-standa-c2411a-cover.png)

Bundle: personal · Synthesis Mode

Every agent standards conversation eventually turns into the same slightly exhausting question: so which one wins?

MCP? A2A? Agent Skills? AGENTS.md? ACP? ANP? Something Microsoft-shaped? Something Google-shaped?

That question feels practical. It is not, really. It turns a stack problem into a horse race.

The useful version is more boring and more technical: what layer is this thing trying to standardize?

Because the research points to three separate layers, not one grand protocol. There is the tool and context layer, where [Anthropic's Model Context Protocol connects AI assistants to the systems where data lives](https://www.anthropic.com/news/model-context-protocol). There is the capability packaging layer, where [Anthropic's Agent Skills package instructions, scripts, and resources into portable folders](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) and [OpenAI's AGENTS.md gives coding agents repo-local instructions in plain Markdown](https://agents.md/). And there is the multi-agent collaboration layer, where [Google's A2A protocol lets independent agents discover capabilities and coordinate tasks](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/).

Different jobs. Different failure modes. Different reasons to care.

## Start with MCP, because MCP is the adapter pressure relief valve

MCP is the obvious place to start because it solved the pain builders were already feeling.

Before MCP, each new data source tended to mean another bespoke integration, which Anthropic named as the fragmentation problem behind the protocol. Anthropic released MCP on 2024-11-25 as ["a new standard for connecting AI assistants to the systems where data lives"](https://www.anthropic.com/news/model-context-protocol), and the key move was not glamorous. It put a uniform client-server protocol between the model host and the outside world.

In MCP terms, the host is the LLM application, like a desktop assistant, IDE, or agent framework, and MCP servers expose capabilities through a JSON-RPC interface, according to the [MCP architecture overview](https://modelcontextprotocol.io/docs/learn/architecture). The core primitives are also nicely plain: [resources, tools, prompts, sampling, and roots](https://modelcontextprotocol.io/docs/learn/architecture). That list matters because it tells you what MCP is and what it is not. It is great for giving one agent controlled access to tools and context. It is not, by itself, a social contract between independent agents.

This is why the "USB-C for agents" framing works up to a point. The research cites an ecosystem estimate of roughly [13,000+ MCP servers in the wild and 800+ in the official registry by April 2026](https://www.qcode.cc/en/mcp-servers-ecosystem-2026). That number may move around depending on how people count servers, but the direction is clear enough: MCP is where tool integration energy pooled first.

The governance move reinforced that. On 2025-12-09, the Linux Foundation announced the Agentic AI Foundation with founding project contributions including [MCP, Block's goose, and OpenAI's AGENTS.md](http://linuxfoundation.org/press/linux-foundation-announces-the-formation-agentic-ai-foundation). That matters less because foundations are magic and more because vendor-neutral stewardship reduces the "am I betting my integration layer on one vendor's roadmap?" anxiety.

Still, MCP is not the whole stack. It is the part of the stack that says: here is how this agent touches the world.

## Skills are not tools. They are memory with a handle.

Agent Skills look deceptively small because the artifact is just a folder.

That is the point.

Anthropic describes Agent Skills as a way to ["build specialized agents using files and folders"](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills). A skill directory has a `SKILL.md` file, frontmatter that describes when to use it, and optional scripts, templates, or references. The model only needs the short description up front; the full instructions load when the skill is invoked, as described in a [first-principles breakdown of Claude Agent Skills](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive).

That is a different abstraction from an MCP tool.

An MCP tool says: call this function. A skill says: when the situation looks like this, load this little operating manual, plus the files that make the manual useful. One is an interface to capability. The other is a packaging format for expertise.

AGENTS.md sits nearby, but with almost comic restraint. The [AGENTS.md spec describes itself as "a simple, open format for guiding coding agents"](https://agents.md/), and the [GitHub repository frames it as a plain Markdown convention](https://github.com/openai/agents.md). No ceremony. No negotiation protocol. Just "here is how to work in this repo."

That minimalism is easy to underestimate. A standard can win because it is technically beautiful. It can also win because nobody needs a meeting to adopt it.

The open question is whether Agent Skills becomes broadly cross-platform or stays mostly attached to Claude-shaped workflows. The research says Anthropic published Agent Skills as an open standard at `agentskills.io`, but adoption beyond Claude is still unclear [Source needed: independent evidence of Agent Skills adoption outside Anthropic/Claude environments].

So the practical stance is simple: use skills and AGENTS.md for instructions you want agents to reuse. Do not confuse that with tool access. And do not expect a folder of instructions to solve runtime trust.

## A2A is what happens after your agent has neighbors

MCP answers, "How does this agent reach tools?"

A2A answers, "How does this agent work with another agent without becoming the same agent?"

Google announced A2A on 2025-04-09 with [more than 50 launch partners](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/). The design goal is not to expose every internal tool or chain-of-thought-shaped secret. It is to let opaque agents describe capabilities, accept work, stream progress, request input, and return artifacts.

The [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) centers on an Agent Card, tasks, messages, parts, artifacts, streaming, and push notifications. That Agent Card is the important social object. It is how another system discovers what the agent claims it can do, what modalities it supports, and what authentication it requires, according to the [A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md).

Google is also explicit that A2A complements MCP rather than replacing it: [A2A is for agent-to-agent interoperability while MCP connects agents to tools and data](https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/). Good. That is the layer boundary. Keep it.

The governance story moved quickly here too. Google donated A2A to the Linux Foundation on 2025-06-23, and the donation announcement says A2A would be governed with a technical steering committee including representatives from [AWS, Cisco, Google, IBM Research, Microsoft, Salesforce, SAP, and ServiceNow](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/).

That is either a convergence signal or a committee-shaped warning light. Probably both.

## The adjacent protocols are not noise if you put them in the right drawer

The rest of the standards landscape looks messier than it is because people keep putting every protocol in the same drawer.

ACP, from IBM Research and BeeAI, is a REST-based agent communication protocol; its own site now says the project is working toward [alignment with A2A](https://agentcommunicationprotocol.dev/), and IBM describes ACP as an [open protocol for AI agents to interact](https://research.ibm.com/projects/agent-communication-protocol). ANP is more internet-native and identity-flavored, using decentralized identifiers and JSON-LD according to the [Agent Network Protocol project](https://agent-network-protocol.com/) and its [GitHub repository](https://github.com/agent-network-protocol/AgentNetworkProtocol).

NLWeb belongs in a different drawer. Microsoft introduced NLWeb as a way to bring [conversational interfaces directly to websites](https://news.microsoft.com/source/features/company-news/introducing-nlweb-bringing-conversational-interfaces-directly-to-the-web/), and the research notes that NLWeb speaks MCP natively. AG-UI is another different drawer: the [AG-UI protocol](https://www.copilotkit.ai/ag-ui) standardizes the event stream between agents and user-facing applications, and its [core architecture docs](https://docs.ag-ui.com/concepts/architecture) describe event types for runs, text messages, and tool calls.

This is where builders can save themselves a lot of architecture theater.

If you are wiring tools, think MCP. If you are packaging reusable agent know-how, think Skills and AGENTS.md. If you need independent agents to discover and coordinate with each other, think A2A. If your website needs a natural-language surface, NLWeb may be the relevant layer. If your frontend needs to render agent progress and tool calls, AG-UI may be the relevant layer.

One protocol does not need to eat all the others for this to be useful.

## The security problem is not a footnote

Here is the part that should make everybody slow down.

MCP gives agents access to tools and data. That is why it is useful. It is also why the attack surface gets weird.

Simon Willison wrote in April 2025 that the [Model Context Protocol has prompt injection security problems](https://simonwillison.net/2025/Apr/9/mcp-prompt-injection/), showing how poisoned tool results can become indirect instructions to the model. Invariant Labs has published work on [MCP security and prompt-injection exposure](https://invariantlabs.ai/blog/mcp-security), and Docker's guidance urges [sandboxing, least privilege, and provenance checks for MCP servers](https://www.docker.com/blog/mcp-security-best-practices/).

This is not an argument against MCP. It is an argument against pretending "standardized" means "safe."

A2A inherits the same basic anxiety and adds a new one: the other agent may be remote, opaque, and attacker-controlled. ANP's DID-based framing and ACP's capability-oriented language are attempts to push identity and capability into the conversation, but the research is thin on what is deployed by default across MCP and A2A implementations [Source needed: current default identity, capability-token, and signed-description posture for MCP and A2A implementations].

The boring version of the security advice is probably the right one. Treat every tool response as untrusted input. Give servers the smallest useful permissions. Prefer sandboxed execution. Track provenance. Make user approval real instead of decorative.

The less boring version is this: every integration standard for agents is also an instruction-injection standard if you wire it lazily.

## The proposal

The long-form piece should not be "MCP vs. A2A vs. Skills." That piece becomes a comparison chart with a pulse.

The better piece is: **agent standards are splitting into layers, and the winning builder move is to adopt by layer instead of by hype cycle.**

The shape:

1. Open with the standards-race fatigue.
2. Reframe the landscape as three layers: tool/context, reusable expertise, and agent collaboration.
3. Walk MCP, Skills/AGENTS.md, and A2A in that order.
4. Put adjacent protocols in their proper drawers.
5. End on security, because that is where the cost of shallow adoption shows up.

The stance is pragmatic. MCP is the default bet for tool and data integration because it has the strongest ecosystem signal and a neutral-governance story through the [Agentic AI Foundation](http://linuxfoundation.org/press/linux-foundation-announces-the-formation-agentic-ai-foundation). A2A is the serious bet for agent collaboration because Google launched it with enterprise partners and then [donated it to the Linux Foundation](https://developers.googleblog.com/en/google-cloud-donates-a2a-to-linux-foundation/). Skills and AGENTS.md are worth treating as the lightweight packaging layer because [Agent Skills are portable folders of agent expertise](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) and [AGENTS.md is intentionally just Markdown guidance for coding agents](https://agents.md/).

That is the stack I would tell a builder to try first:

- Use MCP when the agent needs tools or data.
- Use Skills or AGENTS.md when the agent needs reusable working knowledge.
- Use A2A when the agent needs to be discoverable by, or collaborate with, other agents.
- Use NLWeb or AG-UI only when their surface is actually your surface.
- Treat security as architecture, not cleanup.

The standards are converging, but not into one protocol.

They are converging into a map.
