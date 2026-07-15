import { Link, createFileRoute } from "@tanstack/react-router";
import { brand, suite } from "@/config/brand";
import { StatusLabel } from "@/components/suite/StatusLabel";
import { FollowInvite } from "@/components/suite/FollowInvite";
import { SiteFooter, SiteWordmark } from "@/components/suite/SiteChrome";
import { ThemeToggle } from "@/components/suite/ThemeToggle";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: brand.meta.title }, { name: "description", content: brand.meta.description }],
  }),
  component: SuiteCatalog,
});

function SuiteCatalog() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        className="flex items-start justify-between gap-4 border-b border-border/40 px-6 pb-6 pt-10 sm:px-10 sm:pb-8 sm:pt-14"
        style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}
      >
        <div className="flex flex-col gap-3">
          <SiteWordmark />
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
            Index · v01 · {new Date().getFullYear()}
          </span>
        </div>
        <ThemeToggle />
      </header>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 pb-20 pt-16 sm:px-10 sm:pb-28 sm:pt-24 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/80">
          000 · Overview
        </p>
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Instruments for Human Thinking
          </h1>
          <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Different kinds of thinking happen best in different mediums —
            paper, shared reflection, physical artifacts. The suite is small on
            purpose.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
            <span>01 Available</span>
            <span aria-hidden className="text-border">/</span>
            <span>02 In development</span>
          </div>
        </div>
      </section>

      <section className="border-t border-border/40">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-6 px-6 pb-6 pt-10 sm:px-10">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/80">
            The suite
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/60">
            001 — 003
          </span>
        </div>
        <ol className="mx-auto max-w-5xl border-t border-border/40">
          {suite.map((product, i) => (
            <li
              key={product.slug}
              className={
                "border-b border-border/40 " +
                (product.status === "coming-soon" ? "opacity-75" : "")
              }
            >
              <Link
                to={product.href}
                className="group grid grid-cols-1 gap-8 px-6 py-12 transition-colors hover:bg-accent/20 focus-visible:bg-accent/20 sm:grid-cols-[minmax(0,1fr)_18rem] sm:items-center sm:gap-14 sm:px-10 sm:py-16"
              >
                <div>
                  <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/70">
                    <span>{String(i + 1).padStart(3, "0")}</span>
                    <span aria-hidden className="h-px w-6 bg-border" />
                    <span>Medium · {product.medium.replace(/\.$/, "")}</span>
                  </div>
                  <h2 className="mt-4 font-serif text-4xl leading-none tracking-tight text-foreground sm:text-5xl">
                    {product.name}
                  </h2>
                  <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                    {product.oneLine}
                  </p>
                  <p className="mt-4 max-w-md border-l border-border pl-4 font-serif text-[15px] italic leading-snug text-foreground/70">
                    {product.why}
                  </p>
                  <div className="mt-6 flex items-center gap-4">
                    <StatusLabel status={product.status} label={product.statusLabel} />
                    <span className="text-[11px] uppercase tracking-[0.22em] text-foreground/60 opacity-0 transition-opacity group-hover:opacity-100">
                      Open →
                    </span>
                  </div>
                </div>
                <div className="order-first sm:order-none">
                  <img
                    src={product.sketch}
                    alt={product.sketchAlt}
                    loading="lazy"
                    width={1024}
                    height={1024}
                    className="suite-sketch block h-auto w-full max-w-[12rem] sm:max-w-[14rem]"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-6 py-24 sm:px-10 sm:py-32 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground/80">
          006 · Follow
        </p>
        <div className="max-w-xl">
          <FollowInvite />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
