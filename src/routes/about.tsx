import { Link, createFileRoute } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import { SiteFooter, SiteWordmark } from "@/components/suite/SiteChrome";
import { ThemeToggle } from "@/components/suite/ThemeToggle";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: `About — ${brand.company.name}` },
      { name: "description", content: brand.company.philosophy },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        className="flex items-start justify-between gap-4 px-6 pt-10 sm:px-10 sm:pt-14"
        style={{ paddingTop: "max(2.5rem, env(safe-area-inset-top))" }}
      >
        <SiteWordmark />
        <ThemeToggle />
      </header>

      <main className="px-6 pb-16 pt-16 sm:px-10 sm:pb-24 sm:pt-28">
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
          <Link
            to="/"
            className="mt-12 inline-block text-[11px] uppercase tracking-[0.22em] text-muted-foreground/80 transition-colors hover:text-foreground"
          >
            ← Return to the suite
          </Link>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
