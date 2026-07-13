// Skill-rot guard: agent guidance and docs route readers to files by path.
// After several independently developed branches merged, some of those paths
// pointed at files that never existed in this repo. This test keeps every
// relative markdown link, and every repo path named in AGENTS.md's router
// tables, resolving to a real file.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      out.push(...markdownFiles(full));
    } else if (name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const GUIDANCE_FILES = [
  join(ROOT, "AGENTS.md"),
  join(ROOT, "README.md"),
  ...markdownFiles(join(ROOT, "docs")),
  ...markdownFiles(join(ROOT, "contract")),
];

/** Relative markdown-link targets, e.g. [x](docs/BILLING.md) — skips
 * http(s), mailto, and pure #anchors. */
function relativeLinks(source: string): string[] {
  const links: string[] = [];
  for (const m of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    links.push(target.split("#")[0]);
  }
  return links.filter(Boolean);
}

/** Repo paths named in backticks, e.g. `src/lib/use-credits.ts`. Restricted
 * to paths with a file extension under known top-level dirs so prose like
 * `pieces/<slug>/` or table names don't false-positive. */
function backtickPaths(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/`((?:src|supabase|contract|docs|tests)\/[\w./$-]+\.\w+)`/g)) {
    if (m[1].includes("<") || m[1].includes("…")) continue;
    out.push(m[1]);
  }
  return out;
}

describe("guidance docs point at real files", () => {
  for (const file of GUIDANCE_FILES) {
    const rel = file.slice(ROOT.length + 1);
    it(`${rel}: relative links resolve`, () => {
      const source = readFileSync(file, "utf8");
      const missing = relativeLinks(source).filter(
        (target) => !existsSync(resolve(dirname(file), target)),
      );
      expect(missing, `broken links in ${rel}`).toEqual([]);
    });
  }

  // Router tables in AGENTS.md and README.md also name key code in backticks;
  // those must exist too (directories referenced with trailing slashes are
  // covered by the link check above).
  for (const name of ["AGENTS.md", "README.md"]) {
    it(`${name}: backticked repo paths exist`, () => {
      const source = readFileSync(join(ROOT, name), "utf8");
      const missing = backtickPaths(source).filter((p) => !existsSync(join(ROOT, p)));
      expect(missing, `missing paths named in ${name}`).toEqual([]);
    });
  }
});
