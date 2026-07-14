import { Link, createFileRoute } from "@tanstack/react-router";
import { brand, suite } from "@/config/brand";
import { StatusLabel } from "@/components/suite/StatusLabel";
import { FollowInvite } from "@/components/suite/FollowInvite";
import { SiteFooter } from "@/components/suite/SiteChrome";

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
        className="px-6 pt-10 sm:px-10 sm:pt-14"
        style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}
      >
        <div className="font-serif text-base tracking-tight text-foreground/90">
          {brand.company.name}
        </div>
      </header>

      <section className="px-6 pb-16 pt-16 sm:px-10 sm:pb-24 sm:pt-28">
        <div className="max-w-3xl">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            A small collection of instruments for thinking
          </p>
          <h1 className="mt-6 font-serif text-4xl leading-[1.05] tracking-tight sm:text-6xl">
            Different kinds of thinking
            <br className="hidden sm:block" /> happen best in different mediums.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Five tools, each shaped around one place a mind works well —
            paper, books, conversation, shared reflection, physical artifacts.
          </p>
        </div>
      </section>

      <section className="border-t border-border/40">
        <ol className="mx-auto max-w-5xl">
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
                  <div className="flex items-baseline gap-4">
                    <span className="font-mono text-[11px] text-muted-foreground/60">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2 className="font-serif text-4xl leading-none tracking-tight text-foreground sm:text-5xl">
                      {product.name}
                    </h2>
                  </div>
                  <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                    {product.oneLine}
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
                    className="mx-auto block h-auto w-full max-w-[16rem] sm:max-w-none"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-6 py-24 sm:py-32">
        <FollowInvite />
      </section>

      <SiteFooter />
    </div>
  );
}
