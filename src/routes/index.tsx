import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, color-mix(in oklab, var(--color-primary) 14%, transparent), transparent 60%)",
        }}
      />
      <div className="relative z-10 mx-auto max-w-xl space-y-8 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          Writing studio
        </div>
        <h1 className="font-serif text-5xl leading-[1.02] tracking-tight text-foreground sm:text-7xl">
          Compose<span className="text-primary">.</span>
        </h1>
        <p className="mx-auto max-w-md text-base leading-relaxed text-muted-foreground">
          Paste research, choose a voice, and let the studio draft the piece. Every run kept, every
          draft yours.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            to="/auth"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Get started
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Open dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
