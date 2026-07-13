import { Link, createFileRoute } from "@tanstack/react-router";
import { brand } from "@/config/brand";
import { PageMark } from "@/components/PageMark";
import { AI_WILL_DO, AI_WONT_DO, HOW_IT_WORKS } from "@/config/workflow-copy";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: brand.meta.title }, { name: "description", content: brand.meta.description }],
  }),
  component: Index,
});

// HOW_IT_WORKS lives in src/config/workflow-copy.ts so /new, dashboard,
// and the project hub all tell the same six-verb story.

const PAPER_QUALITIES: string[] = [
  "Finite and visible",
  "Easy to annotate",
  "Portable",
  "Works offline",
  "Readable in sunlight",
  "Naturally slower",
  "Physically memorable",
];

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{children}</p>
  );
}

const primaryCta =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const secondaryCta =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Index() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <AICompact />
        <FirstProduct />
        <WhyPaper />
        <Authorship />
        <DesignedForLeaving />
        <Ecosystem />
        <FinalAction />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="flex min-h-11 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <PageMark className="h-6 w-6 shrink-0 text-primary" />
          <span className="font-serif text-lg tracking-tight">{brand.company.name}</span>
        </Link>
        <nav className="hidden items-center gap-1 text-sm sm:flex" aria-label="Site">
          <a
            href="#how-it-works"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            How it works
          </a>
          <a
            href="#product"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            The product
          </a>
          <a
            href="#why-hardcopy"
            className="rounded-md px-3 py-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            Why hardcopy
          </a>
        </nav>
        <Link
          to="/auth"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Sign in
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-14 sm:pb-24 sm:pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, color-mix(in oklab, var(--color-primary) 12%, transparent), transparent 60%)",
        }}
      />
      <div className="relative z-10 mx-auto max-w-3xl space-y-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          {brand.company.category}
        </div>
        <h1 className="mx-auto max-w-2xl font-serif text-4xl leading-[1.05] tracking-tight sm:text-6xl">
          {brand.company.line}
        </h1>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
          Research a subject with AI. Print a working hardcopy. Think and mark it up by hand.
          Return your notes. Finish in Word, slides, or a merged draft — in your voice.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
          <Link to="/auth" className={`${primaryCta} w-full sm:w-auto`}>
            Start a project
          </Link>
          <a href="#how-it-works" className={`${secondaryCta} w-full sm:w-auto`}>
            See how it works
          </a>
        </div>
        <WorkflowVisual />
      </div>
    </section>
  );
}

/**
 * The loop, drawn with CSS instead of screenshots: digital draft → printed,
 * hand-marked pages → refined artifact. The paper page is the center of
 * gravity. Purely decorative; the sequence is described in text below it.
 */
function WorkflowVisual() {
  const bar = "h-1.5 rounded-full";
  return (
    <figure className="pt-6">
      <div aria-hidden className="flex items-center justify-center gap-2 sm:gap-4">
        {/* Digital draft */}
        <div className="w-20 shrink rounded-lg border border-border bg-card p-2.5 shadow-sm sm:w-32 sm:p-4">
          <div className="space-y-1.5 sm:space-y-2">
            <div className={`${bar} w-1/2 bg-primary/60`} />
            <div className={`${bar} w-full bg-muted-foreground/30`} />
            <div className={`${bar} w-full bg-muted-foreground/30`} />
            <div className={`${bar} w-3/4 bg-muted-foreground/30`} />
            <div className={`${bar} w-full bg-muted-foreground/30`} />
            <div className={`${bar} w-2/3 bg-muted-foreground/30`} />
          </div>
        </div>

        <span className="text-lg text-muted-foreground/70 sm:text-xl">→</span>

        {/* Printed page with anchors and handwritten marks */}
        <div className="relative w-40 shrink-0 rounded-sm bg-paper p-3 pl-8 text-left shadow-lg shadow-black/30 sm:w-56 sm:p-5 sm:pl-11">
          <span
            className="absolute right-0 top-0 h-4 w-4 sm:h-5 sm:w-5"
            style={{
              background:
                "linear-gradient(225deg, var(--color-background) 50%, color-mix(in oklab, var(--color-paper) 82%, black) 50%)",
            }}
          />
          <div className="absolute left-2 top-3 space-y-[1.05rem] font-mono text-[6px] leading-none text-paper-foreground/40 sm:left-3 sm:top-5 sm:space-y-[1.35rem] sm:text-[8px]">
            <div>S1</div>
            <div>S1P1</div>
            <div>S1P2</div>
            <div>S1P3</div>
          </div>
          <div className="space-y-2 sm:space-y-2.5">
            <div className={`${bar} w-2/3 bg-paper-foreground/70`} />
            <div className="space-y-1.5 pt-1 sm:space-y-2">
              <div className={`${bar} w-full bg-paper-foreground/25`} />
              <div className="relative">
                <div className={`${bar} w-full bg-paper-foreground/25`} />
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 -rotate-1 bg-annotation" />
              </div>
              <div className={`${bar} w-5/6 bg-paper-foreground/25`} />
              <div className="relative">
                <div className={`${bar} w-full bg-paper-foreground/25`} />
                <span className="absolute -right-1 -top-2 font-serif text-[10px] italic leading-none text-annotation sm:-right-2 sm:text-xs">
                  tighten
                </span>
                <div className="absolute -bottom-1 left-0 h-px w-2/3 bg-annotation/80" />
              </div>
              <div className={`${bar} w-3/4 bg-paper-foreground/25`} />
              <span className="block font-serif text-[10px] italic leading-none text-annotation sm:text-xs">
                ★ add the Tuesday example
              </span>
            </div>
          </div>
        </div>

        <span className="text-lg text-muted-foreground/70 sm:text-xl">→</span>

        {/* Refined artifact */}
        <div className="w-20 shrink rounded-lg border border-border bg-card p-2.5 shadow-sm sm:w-32 sm:p-4">
          <div className="space-y-1.5 sm:space-y-2">
            <div className={`${bar} w-1/2 bg-primary/60`} />
            <div className={`${bar} w-full bg-foreground/40`} />
            <div className={`${bar} w-5/6 bg-foreground/40`} />
            <div className={`${bar} w-full bg-foreground/40`} />
            <div className={`${bar} w-2/3 bg-foreground/40`} />
          </div>
        </div>
      </div>
      <figcaption className="pt-4 text-xs text-muted-foreground">
        Digital draft → printed pages, marked by hand → refined artifact.
      </figcaption>
    </figure>
  );
}

function Problem() {
  return (
    <section className="border-t border-border/60 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <h2 className="font-serif text-2xl tracking-tight sm:text-4xl">
          Good work should not require permanent screen time.
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          Modern tools are powerful, but nearly all of them ask you to stay inside the interface.{" "}
          {brand.company.name} creates deliberate exits from the screen — the AI carries the
          context, the research, and the repetitive work, so you can take the thinking somewhere
          quieter and come back without losing the thread.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-t border-border/60 px-4 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-3xl space-y-10">
        <div className="space-y-3">
          <Kicker>How it works</Kicker>
          <h2 className="font-serif text-2xl tracking-tight sm:text-4xl">
            Explore. Print. Think. Return. Refine. Finish.
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Not a one-click process — a collaboration loop. The same six verbs whether you're
            drafting a piece in your voice or studying a subject and writing from it. The AI does
            the carrying; you do the thinking.
          </p>
        </div>
        <ol className="space-y-0">
          {HOW_IT_WORKS.map((item, i) => (
            <li
              key={item.step}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-l border-border/70 pb-8 pl-0 last:pb-0"
            >
              <span
                className="-ml-px flex h-8 items-start justify-center border-l-2 border-primary/70 pt-0.5 font-mono text-xs text-muted-foreground"
                aria-hidden
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="space-y-1.5">
                <h3 className="font-serif text-lg tracking-tight sm:text-xl">{item.step}</h3>
                <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FirstProduct() {
  return (
    <section id="product" className="scroll-mt-20 border-t border-border/60 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl space-y-6">
        <Kicker>The first product</Kicker>
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-9">
          <div className="flex items-center gap-2.5">
            <PageMark className="h-5 w-5 text-primary" />
            <h2 className="font-serif text-2xl tracking-tight sm:text-3xl">{brand.product.name}</h2>
          </div>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {brand.product.descriptor}
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            It helps you produce essays, reports, proposals, research briefs, speeches, chapters —
            thoughtful long-form work. You set your voice once; every draft is prepared in it, and
            every revision carries your marks forward.
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Signing up includes three credits. A finished draft uses one; starting with deep
            research uses two. Printing and marking up what you've made is always free, and nothing
            is charged for work that fails.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link to="/auth" className={`${primaryCta} w-full sm:w-auto`}>
              Start a working draft
            </Link>
            <p className="text-xs text-muted-foreground">
              A working name — the label may change; the loop won't.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function WhyPaper() {
  return (
    <section
      id="why-hardcopy"
      className="scroll-mt-20 border-t border-border/60 px-4 py-14 sm:py-20"
    >
      <div className="mx-auto grid max-w-3xl gap-10 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Kicker>Why paper</Kicker>
          <h2 className="font-serif text-2xl tracking-tight sm:text-4xl">
            Paper creates a boundary.
          </h2>
          <div className="space-y-3 text-base leading-relaxed text-muted-foreground">
            <p>It does not notify you. It does not scroll forever.</p>
            <p>
              It lets you see the whole page, leave a mark, and remain with an idea. Paper here is
              not an export format — it's a calm, tactile interface that needs no battery, login, or
              network.
            </p>
            <p>
              And if paper isn't your mode — because of ability, circumstance, or preference — every
              step works on screen too. The exits are invitations, not requirements.
            </p>
          </div>
        </div>
        <ul className="grid content-start gap-2 self-center">
          {PAPER_QUALITIES.map((q) => (
            <li
              key={q}
              className="flex items-center gap-3 rounded-md border border-border/70 bg-card/50 px-3.5 py-2.5 text-sm text-foreground"
            >
              <span className="h-px w-4 shrink-0 bg-annotation" aria-hidden />
              {q}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Authorship() {
  return (
    <section className="border-t border-border/60 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl space-y-6">
        <Kicker>Your voice remains the point</Kicker>
        <h2 className="max-w-2xl font-serif text-2xl tracking-tight sm:text-4xl">
          The artifact should sound like you because you shaped it.
        </h2>
        <div className="max-w-2xl space-y-3 text-base leading-relaxed text-muted-foreground">
          <p>
            AI can research and organize. But you read the work. You mark what matters. You supply
            the judgment, the memory, the rhythm, and the intent — and the system carries those
            decisions into the next draft.
          </p>
          <p>
            This is not automatic content generation. It's an iterative process that leaves you with
            something you've genuinely read, understood, and shaped — work you're more likely to
            remember, because you did the remembering on the page.
          </p>
        </div>
      </div>
    </section>
  );
}

function DesignedForLeaving() {
  const places = [
    "a kitchen table",
    "a porch",
    "a train",
    "a park bench",
    "a waiting room",
    "somewhere without internet",
  ];
  return (
    <section className="border-t border-border/60 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl space-y-5 text-center">
        <Kicker>Designed for leaving</Kicker>
        <h2 className="font-serif text-2xl tracking-tight sm:text-4xl">
          The work can come with you.
        </h2>
        <p className="text-base leading-relaxed text-muted-foreground">
          A printed draft travels to {places.slice(0, -1).join(", ")} — or {places.at(-1)} — without
          bringing the entire internet along.
        </p>
      </div>
    </section>
  );
}

function Ecosystem() {
  return (
    <section className="border-t border-border/60 px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <Kicker>The broader ecosystem</Kicker>
        <h2 className="font-serif text-2xl tracking-tight sm:text-4xl">
          The first of many hardcopy tools.
        </h2>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
          {brand.product.name} begins with research and writing. {brand.company.name} will grow into
          a broader family of human-paced tools designed to move between intelligence, paper, voice,
          and physical life.
        </p>
      </div>
    </section>
  );
}

function FinalAction() {
  return (
    <section className="border-t border-border/60 px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-2xl space-y-7 text-center">
        <h2 className="font-serif text-3xl tracking-tight sm:text-5xl">
          {brand.company.philosophy}
        </h2>
        <Link to="/auth" className={primaryCta}>
          Start your first working draft
        </Link>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer
      className="border-t border-border/60 px-4 py-10"
      style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <PageMark className="h-5 w-5 text-primary" />
            <span className="font-serif text-base tracking-tight">{brand.company.name}</span>
          </div>
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
            {brand.company.category}
          </p>
          <p className="text-xs text-muted-foreground">{brand.company.domain}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm sm:items-end">
          <a
            href="#how-it-works"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <a
            href="#product"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            The product
          </a>
          <a
            href="#why-hardcopy"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Why hardcopy
          </a>
          <Link
            to="/auth"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
