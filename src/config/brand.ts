/**
 * Brand configuration — the single source of truth for names and messaging.
 *
 * "Hardcopy Draft" is a provisional product label (see docs/brand/NAMING.md).
 * When the final product name is approved, changing `product.name` here
 * updates every surface that uses it.
 */
export const brand = {
  company: {
    name: "Hardcopy Tools",
    domain: "hardcopy.tools",
    /** The defining brand principle. */
    line: "AI that knows when to disappear.",
    /** The broader product philosophy. */
    philosophy: "Leave the screen. Keep the thread.",
    category: "Human-paced tools for working with AI beyond the screen.",
  },
  product: {
    /** Provisional — do not treat as final. */
    name: "Hardcopy Draft",
    descriptor:
      "A research and drafting collaborator built to move between AI, paper, handwriting, and voice.",
  },
  meta: {
    title: "Hardcopy Tools | AI That Knows When to Disappear",
    description:
      "Research and create with AI, continue on paper, and bring your handwritten thinking back into a refined artifact that sounds like you.",
  },
} as const;

/** Per-page document titles: `pageTitle("Dashboard")` → "Dashboard — Hardcopy Draft". */
export function pageTitle(page: string): string {
  return `${page} — ${brand.product.name}`;
}
