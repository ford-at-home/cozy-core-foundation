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
      "Research with AI. Think on paper. Return your notes. Finish in Word, slides, or a merged draft — in your voice.",
  },
  meta: {
    title: "Hardcopy Tools | AI That Knows When to Disappear",
    description:
      "Research a subject with AI, print a working hardcopy, mark it up by hand, and return your notes — turning your thinking into a Word document, a class presentation, or a merged draft in your voice.",
  },
} as const;

/** Per-page document titles: `pageTitle("Dashboard")` → "Dashboard — Hardcopy Draft". */
export function pageTitle(page: string): string {
  return `${page} — ${brand.product.name}`;
}
