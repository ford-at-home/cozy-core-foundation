/**
 * Brand configuration — the single source of truth for names and messaging.
 *
 * "Hardcopy Draft" is a provisional product label (see docs/brand/NAMING.md).
 * When the final product name is approved, changing `product.name` here
 * updates every surface that uses it.
 */
import proofSketch from "@/assets/suite/proof.jpg";
import editionSketch from "@/assets/suite/edition.jpg";
import dialogueSketch from "@/assets/suite/dialogue.jpg";
import interludeSketch from "@/assets/suite/interlude.jpg";
import canonSketch from "@/assets/suite/canon.jpg";

export const brand = {
  company: {
    name: "Hardcopy Tools",
    domain: "hardcopy.tools",
    /** The defining brand principle. */
    line: "Instruments for thinking.",
    /** The broader product philosophy. */
    philosophy: "Different kinds of thinking happen best in different mediums.",
    category: "A small collection of tools for reading, revising, conversing, reflecting, and remembering.",
  },
  product: {
    /** Provisional — do not treat as final. */
    name: "Proof",
    descriptor:
      "Turn handwritten reviews, printed documents, and annotated pages into polished digital artifacts.",
  },
  meta: {
    title: "Hardcopy Tools",
    description:
      "A small collection of instruments for thinking. Proof, Edition, Dialogue, Interlude, Canon — each embraces a different medium.",
  },
} as const;

/** Per-page document titles: `pageTitle("Dashboard")` → "Dashboard — Hardcopy Draft". */
export function pageTitle(page: string): string {
  return `${page} — ${brand.product.name}`;
}

export type SuiteStatus = "available" | "beta" | "coming-soon";

export type SuiteProduct = {
  slug: "proof" | "edition" | "dialogue" | "interlude" | "canon";
  name: string;
  status: SuiteStatus;
  statusLabel: string;
  oneLine: string;
  medium: string;
  why: string;
  description: string;
  sketch: string;
  sketchAlt: string;
  href: string;
};

export const suite: readonly SuiteProduct[] = [
  {
    slug: "proof",
    name: "Proof",
    status: "available",
    statusLabel: "Available",
    oneLine:
      "Turn handwritten reviews, printed documents, and annotated pages into polished digital artifacts.",
    medium: "Paper.",
    why: "Because the sharpest edits still happen in the margin.",
    description:
      "Print a working draft, mark it up by hand, and return your notes. Proof reads your handwriting and finishes the piece in your voice — as a merged draft, a Word document, or a class presentation.",
    sketch: proofSketch,
    sketchAlt: "A graphite sketch of a printed manuscript with handwritten margin notes.",
    href: "/proof",
  },
  {
    slug: "edition",
    name: "Edition",
    status: "beta",
    statusLabel: "Beta",
    oneLine:
      "Transform reports, articles, research, and long-form writing into beautiful offline reading editions designed for focused attention.",
    medium: "Books.",
    why: "Because attention deepens when a text is bound and finite.",
    description:
      "Give a long piece the treatment a book gives it — careful typesetting, generous margins, a real cover. Edition prepares work for the way people actually read when the interface goes away.",
    sketch: editionSketch,
    sketchAlt: "A graphite sketch of a small bound book, open to a page of typeset text.",
    href: "/edition",
  },
  {
    slug: "dialogue",
    name: "Dialogue",
    status: "coming-soon",
    statusLabel: "Coming soon",
    oneLine:
      "A conversational companion that calls you on the phone at scheduled times and helps you think through your intentions, priorities, and commitments.",
    medium: "Conversation.",
    why: "Because some thoughts only arrive when you have to say them out loud.",
    description:
      "Dialogue calls at a time you choose and asks the questions you would ask yourself if you remembered to. No screen, no chat window — just a voice, a few minutes, and a clearer sense of what matters this week.",
    sketch: dialogueSketch,
    sketchAlt: "A graphite sketch of a rotary telephone handset resting on a small notebook.",
    href: "/dialogue",
  },
  {
    slug: "interlude",
    name: "Interlude",
    status: "coming-soon",
    statusLabel: "Coming soon",
    oneLine:
      "A quiet facilitator for important conversations. It listens locally, remains silent almost all the time, and only speaks when one carefully chosen question has a meaningful chance of improving the discussion.",
    medium: "Shared reflection.",
    why: "Because the best facilitator is measured by how rarely they interrupt.",
    description:
      "Interlude sits at the edge of the room. It listens on the device, holds its tongue, and — perhaps once in a long meeting — offers a single question. Its intelligence is restraint.",
    sketch: interludeSketch,
    sketchAlt:
      "A graphite sketch of two simple wooden chairs facing each other across a small round table.",
    href: "/interlude",
  },
  {
    slug: "canon",
    name: "Canon",
    status: "coming-soon",
    statusLabel: "Coming soon",
    oneLine:
      "Transform important conversations into enduring physical artifacts that preserve shared principles beyond the meeting itself.",
    medium: "Physical artifacts.",
    why: "Because commitments that outlive the meeting need somewhere to live.",
    description:
      "Canon distills what a group agreed on into a small, beautifully crafted physical object — a bound booklet, an engraved plaque, a printed card set — so the shared principles stay in the room long after everyone leaves it.",
    sketch: canonSketch,
    sketchAlt:
      "A graphite sketch of a small cloth-bound book beside an engraved brass plaque bearing a short inscription.",
    href: "/canon",
  },
] as const;

export const suiteBySlug: Record<SuiteProduct["slug"], SuiteProduct> = Object.fromEntries(
  suite.map((p) => [p.slug, p]),
) as Record<SuiteProduct["slug"], SuiteProduct>;
