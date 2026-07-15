/**
 * Brand configuration — the single source of truth for names and messaging.
 *
 * "Hardcopy Draft" is a provisional product label (see docs/brand/NAMING.md).
 * When the final product name is approved, changing `product.name` here
 * updates every surface that uses it.
 */
import proofSketch from "@/assets/suite/proof.png";
import interludeSketch from "@/assets/suite/interlude.png";
import canonSketch from "@/assets/suite/canon.png";

export const brand = {
  company: {
    name: "Hardcopy Tools",
    domain: "hardcopy.tools",
    /** The defining brand principle. */
    line: "Instruments for thinking.",
    /** The broader product philosophy. */
    philosophy: "Our deepest, truest thinking happens in quiet, screen-free spaces. Frontier intelligence at the pace of human thought.",
    category: "A small collection of tools for revising, reflecting, and remembering.",
  },
  product: {
    /** Provisional — do not treat as final. */
    name: "Proof",
    descriptor:
      "Create deep research in your own style, print and edit it, then dictate it back into the system to produce iterative drafts.",
  },
  meta: {
    title: "Hardcopy Tools",
    description:
      "A small collection of instruments for thinking. Proof, Interlude, Canon — each embraces a different medium.",
  },
} as const;

/** Per-page document titles: `pageTitle("Dashboard")` → "Dashboard — Hardcopy Draft". */
export function pageTitle(page: string): string {
  return `${page} — ${brand.product.name}`;
}

export type SuiteStatus = "available" | "beta" | "coming-soon";

export type SuiteProduct = {
  slug: "proof" | "interlude" | "canon";
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
      "Create deep research in your own style, print and edit it, then dictate it back into the system to produce iterative drafts.",
    medium: "Paper.",
    why: "\n",
    description:
      "Print a working draft, mark it up by hand, and return your notes. Proof reads your handwriting and finishes the piece in your voice — as a merged draft, a Word document, or a class presentation.",
    sketch: proofSketch,
    sketchAlt: "A graphite sketch of a printed manuscript with handwritten margin notes.",
    href: "/proof",
  },
  {
    slug: "interlude",
    name: "Interlude",
    status: "coming-soon",
    statusLabel: "Coming soon",
    oneLine:
      "Deploy air-gapped frontier intelligence into high-stakes negotiations to act as a Socratic coach.",
    medium: "Shared reflection.",
    why: "\n",
    description:
      "Interlude sits at the edge of the room. It listens on the device, holds its tongue, and — perhaps once in a long meeting — offers a single question. Its intelligence is restraint.",
    sketch: interludeSketch,
    sketchAlt:
      "A graphite sketch of a small triangular listening device sitting quietly on a table.",
    href: "/interlude",
  },
  {
    slug: "canon",
    name: "Canon",
    status: "coming-soon",
    statusLabel: "Coming soon",
    oneLine:
      "Transform important conversations into enduring physical artifacts, created onsite in real time.",
    medium: "Physical artifacts.",
    why: "\n",
    description:
      "Canon distills what a group agreed on into a small, beautifully crafted physical object — a bound booklet, an engraved plaque, a printed card set — so the shared principles stay in the room long after everyone leaves it.",
    sketch: canonSketch,
    sketchAlt:
      "A graphite sketch of a wooden tablet inscribed with a short list of tenets.",
    href: "/canon",
  },
] as const;

export const suiteBySlug: Record<SuiteProduct["slug"], SuiteProduct> = Object.fromEntries(
  suite.map((p) => [p.slug, p]),
) as Record<SuiteProduct["slug"], SuiteProduct>;
