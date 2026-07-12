// Guard against agent-OS rot: every repository path and npm script referenced
// by AGENTS.md, the skills, and the reviewer subagents must actually exist.
// The skills were originally written on separate branches and drifted from
// the merged code; this test makes that class of staleness fail CI instead
// of silently misrouting future agents.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function agentOsFiles(): string[] {
  const files = ["AGENTS.md"];
  for (const dir of readdirSync(join(ROOT, ".cursor/skills"))) {
    files.push(join(".cursor/skills", dir, "SKILL.md"));
  }
  for (const file of readdirSync(join(ROOT, ".cursor/agents"))) {
    files.push(join(".cursor/agents", file));
  }
  return files;
}

/** Backtick-quoted tokens that look like repository paths. */
function referencedPaths(markdown: string): string[] {
  const tokens = [...markdown.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return tokens.filter(
    (t) =>
      /^(src|docs|supabase|tests|scripts|contract|public|\.cursor|\.github)\//.test(t) &&
      // Skip glob patterns and placeholders — they are illustrative, not paths.
      !/[*<>{}]|\$\{/.test(t) &&
      // Skip section references like `docs/BILLING.md#anchor`.
      !t.includes("#"),
  );
}

/** npm scripts invoked as `npm run x` or `npm test` (plain or chained). */
function referencedNpmScripts(markdown: string): string[] {
  const scripts = new Set<string>();
  for (const m of markdown.matchAll(/npm run ([a-z0-9:_-]+)/g)) scripts.add(m[1]);
  if (/npm test\b/.test(markdown)) scripts.add("test");
  return [...scripts];
}

const packageScripts = Object.keys(
  (
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts,
);

describe("agent operating system references", () => {
  for (const file of agentOsFiles()) {
    describe(file, () => {
      const markdown = readFileSync(join(ROOT, file), "utf8");

      it("references only paths that exist", () => {
        const missing = referencedPaths(markdown).filter((p) => !existsSync(join(ROOT, p)));
        expect(missing, `stale path reference(s) in ${file}`).toEqual([]);
      });

      it("references only npm scripts that exist", () => {
        const missing = referencedNpmScripts(markdown).filter((s) => !packageScripts.includes(s));
        expect(missing, `stale npm script reference(s) in ${file}`).toEqual([]);
      });
    });
  }

  it("every skill on disk is routed by AGENTS.md", () => {
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    const skillNames = readdirSync(join(ROOT, ".cursor/skills")).filter((d) =>
      existsSync(join(ROOT, ".cursor/skills", d, "SKILL.md")),
    );
    const unrouted = skillNames.filter((name) => !agents.includes(`\`${name}\``));
    expect(unrouted, "skills exist that AGENTS.md never routes to").toEqual([]);
  });

  it("every reviewer subagent is referenced by AGENTS.md", () => {
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    const subagents = readdirSync(join(ROOT, ".cursor/agents")).map((f) => f.replace(/\.md$/, ""));
    const unreferenced = subagents.filter((name) => !agents.includes(`\`${name}\``));
    expect(unreferenced, "subagents exist that AGENTS.md never mentions").toEqual([]);
  });
});
