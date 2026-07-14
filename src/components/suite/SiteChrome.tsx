import { Link } from "@tanstack/react-router";
import { brand } from "@/config/brand";

/**
 * Restrained wordmark used on every outer page. No nav — the homepage
 * IS the navigation.
 */
export function SiteWordmark({ align = "left" }: { align?: "left" | "center" }) {
  return (
    <Link
      to="/"
      className={
        "inline-flex items-baseline gap-2 font-serif text-base tracking-tight text-foreground/90 transition-opacity hover:opacity-80 " +
        (align === "center" ? "mx-auto" : "")
      }
    >
      <span>{brand.company.name}</span>
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer
      className="px-6 pb-12 pt-8 text-center text-[11px] uppercase tracking-[0.22em] text-muted-foreground/70"
      style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
    >
      {brand.company.name} · {brand.company.domain}
    </footer>
  );
}