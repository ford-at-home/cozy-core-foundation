import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { brand, type SuiteProduct } from "@/config/brand";
import { StatusLabel } from "./StatusLabel";
import { SiteWordmark, SiteFooter } from "./SiteChrome";
import { FollowInvite } from "./FollowInvite";

export function ProductPage({
  product,
  action,
}: {
  product: SuiteProduct;
  action: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="px-6 pt-8 sm:px-10 sm:pt-10">
        <SiteWordmark />
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16 pt-16 sm:px-10 sm:pb-24 sm:pt-24">
        <StatusLabel status={product.status} label={product.statusLabel} />
        <h1 className="mt-4 font-serif text-5xl leading-[1.05] tracking-tight sm:text-7xl">
          {product.name}
        </h1>
        <p className="mt-5 max-w-xl font-serif text-xl leading-snug text-foreground/85 sm:text-2xl">
          {product.oneLine}
        </p>

        <figure className="mx-auto my-16 max-w-xl sm:my-24">
          <img
            src={product.sketch}
            alt={product.sketchAlt}
            loading="lazy"
            width={1024}
            height={1024}
            className="mx-auto block h-auto w-full mix-blend-screen opacity-90"
          />
        </figure>

        <div className="mx-auto max-w-xl space-y-6">
          <p className="font-serif text-2xl leading-tight text-foreground/90">{product.medium}</p>
          <p className="text-base leading-relaxed text-muted-foreground">{product.description}</p>
          <p className="font-serif text-lg italic leading-snug text-foreground/75">
            {product.why}
          </p>
        </div>

        <div className="mt-16 flex flex-col items-center gap-8 sm:mt-20">
          {action}
          <Link
            to="/"
            className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80 transition-colors hover:text-foreground"
          >
            ← Return to the suite
          </Link>
        </div>
      </main>

      <section className="border-t border-border/50 px-6 py-16 sm:py-20">
        <FollowInvite />
      </section>

      <SiteFooter />
    </div>
  );
}

export function productHead(product: SuiteProduct) {
  const title = `${product.name} — ${brand.company.name}`;
  return {
    meta: [
      { title },
      { name: "description", content: product.oneLine },
      { property: "og:title", content: title },
      { property: "og:description", content: product.oneLine },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: product.oneLine },
    ],
  };
}