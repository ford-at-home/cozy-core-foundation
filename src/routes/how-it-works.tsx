import { Link, createFileRoute } from "@tanstack/react-router";
import { Fragment } from "react";
import { brand } from "@/config/brand";
import { SiteFooter, SiteWordmark } from "@/components/suite/SiteChrome";
import { ThemeToggle } from "@/components/suite/ThemeToggle";
import { HowItWorksDiagram, type DiagramId } from "@/components/suite/HowItWorksDiagrams";
import MarkdownView from "@/components/MarkdownView";
import articleSource from "../../content/how-it-works.md?raw";

type ArticleMeta = {
  title: string;
  description: string;
  kicker: string;
  body: string;
};

const DIAGRAM_RE = /<!--\s*diagram:(coordination|runtime|cost)\s*-->/;

function parseArticle(source: string): ArticleMeta {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) {
    return {
      title: "How Lovable Cloud and Cursor Agents Work Together",
      description: "An engineering walkthrough of the Lovable Cloud and Cursor Agents workflow.",
      kicker: "Engineering notes",
      body: source,
    };
  }

  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    return {
      title: "How Lovable Cloud and Cursor Agents Work Together",
      description: "An engineering walkthrough of the Lovable Cloud and Cursor Agents workflow.",
      kicker: "Engineering notes",
      body: source,
    };
  }

  const frontmatter = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).trimStart();
  const fields: Record<string, string> = {};
  for (const line of frontmatter.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    fields[key] = value;
  }

  return {
    title: fields.title ?? "How Lovable Cloud and Cursor Agents Work Together",
    description:
      fields.description ??
      "An engineering walkthrough of the Lovable Cloud and Cursor Agents workflow.",
    kicker: fields.kicker ?? "Engineering notes",
    body,
  };
}

function splitWithDiagrams(body: string) {
  const parts = body.split(DIAGRAM_RE);
  const segments: Array<{ type: "markdown"; source: string } | { type: "diagram"; id: DiagramId }> =
    [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (part === "coordination" || part === "runtime" || part === "cost") {
      segments.push({ type: "diagram", id: part });
    } else {
      segments.push({ type: "markdown", source: part });
    }
  }

  return segments;
}

const article = parseArticle(articleSource);
const segments = splitWithDiagrams(article.body);

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: `How it works — ${brand.company.name}` },
      { name: "description", content: article.description },
      { property: "og:title", content: `How it works — ${brand.company.name}` },
      { property: "og:description", content: article.description },
    ],
  }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        className="flex items-start justify-between gap-4 px-6 pt-10 sm:px-10 sm:pt-14"
        style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}
      >
        <SiteWordmark />
        <ThemeToggle />
      </header>

      <main
        className="px-6 pb-16 pt-14 sm:px-10 sm:pb-24 sm:pt-20"
        style={{ paddingBottom: "max(4rem, env(safe-area-inset-bottom))" }}
      >
        <article className="mx-auto max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            {article.kicker}
          </p>
          <h1 className="mt-6 font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">
            {article.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {article.description}
          </p>

          <div className="mt-12">
            {segments.map((segment, index) =>
              segment.type === "diagram" ? (
                <HowItWorksDiagram key={`diagram-${segment.id}`} id={segment.id} />
              ) : (
                <Fragment key={`md-${index}`}>
                  <MarkdownView source={segment.source} className="article" />
                </Fragment>
              ),
            )}
          </div>

          <Link
            to="/"
            className="mt-14 inline-flex min-h-11 items-center text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80 transition-colors hover:text-foreground"
          >
            ← Return to the suite
          </Link>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
