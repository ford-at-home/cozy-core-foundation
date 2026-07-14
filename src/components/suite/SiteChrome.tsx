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
        className="block h-16 w-auto dark:hidden sm:h-20"
      />
      <img
        src={logoDark.url}
        alt={brand.company.name}
        loading="eager"
        width={128}
        height={77}
        className="hidden h-16 w-auto dark:block sm:h-20"
      />
    </Link>
  );
}

export function SiteFooter() {
  return (
    <footer
      className="border-t border-border/40 px-6 pb-12 pt-10 sm:px-10"
      style={{ paddingBottom: "max(3rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[10rem_minmax(0,1fr)_auto] md:gap-16">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
          Colophon
        </span>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {brand.company.name} is a small studio building instruments for
          thinking. Each tool is designed, made, and quietly maintained here.
        </p>
        <div className="flex flex-col gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70 md:text-right">
          <span>{brand.company.domain}</span>
          <span>© {new Date().getFullYear()} {brand.company.name}</span>
        </div>
      </div>
    </footer>
  );
}