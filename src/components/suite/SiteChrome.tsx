import { Link } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import logoLight from "@/assets/logo-light.png.asset.json";
import logoDark from "@/assets/logo-dark.png.asset.json";

/**
 * Restrained wordmark used on every outer page. No nav — the homepage
 * IS the navigation.
 */
export function SiteWordmark({ align = "left" }: { align?: "left" | "center" }) {
  return (
    <Link
      to="/"
      className={
        "inline-flex items-center transition-opacity hover:opacity-80 " +
        (align === "center" ? "mx-auto" : "")
      }
    >
      <img
        src={logoLight.url}
        alt={brand.company.name}
        loading="eager"
        width={128}
        height={77}
        className="block h-12 w-auto dark:hidden sm:h-16"
      />
      <img
        src={logoDark.url}
        alt={brand.company.name}
        loading="eager"
        width={128}
        height={77}
        className="hidden h-12 w-auto dark:block sm:h-16"
      />
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