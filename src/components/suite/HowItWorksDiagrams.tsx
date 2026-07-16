type DiagramId = "coordination" | "runtime" | "cost";

const diagrams: Record<DiagramId, { caption: string; steps: { label: string; detail: string }[] }> =
  {
    coordination: {
      caption: "Development handoff — repository as async API",
      steps: [
        { label: "1. Author", detail: "Cursor changes source in git" },
        { label: "2. Request", detail: "WI filed in the other agent’s inbox" },
        { label: "3. Apply", detail: "Lovable deploys or migrates live" },
        { label: "4. Evidence", detail: "Results land in the outbox" },
      ],
    },
    runtime: {
      caption: "Product runtime — control plane vs execution plane",
      steps: [
        { label: "UI", detail: "Hardcopy Draft on Lovable Cloud" },
        { label: "Control", detail: "Edge Functions + Postgres job row" },
        { label: "Execute", detail: "Cursor Cloud Agent (or other provider)" },
        { label: "Reconcile", detail: "Webhook + authoritative reconciler" },
      ],
    },
    cost: {
      caption: "Cursor cost visibility today — aggregates, not sessions",
      steps: [
        { label: "Limits", detail: "Team + Cloud Agent spend caps" },
        { label: "Pools", detail: "Composer/Auto vs API frontier" },
        { label: "Dashboard", detail: "Usage filtered by user / surface" },
        { label: "Gap", detail: "No per-session agent rollup yet" },
      ],
    },
  };

export function HowItWorksDiagram({ id }: { id: DiagramId }) {
  const diagram = diagrams[id];
  return (
    <figure
      className="my-10 border border-border/50 bg-muted/20 px-4 py-5 sm:px-6 sm:py-6"
      aria-label={diagram.caption}
    >
      <figcaption className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {diagram.caption}
      </figcaption>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {diagram.steps.map((step, index) => (
          <li
            key={step.label}
            className="relative flex min-h-11 flex-col justify-center border border-border/40 bg-background/60 px-3 py-3"
          >
            {index < diagram.steps.length - 1 ? (
              <span
                className="pointer-events-none absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-muted-foreground/50 lg:block"
                aria-hidden
              >
                →
              </span>
            ) : null}
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {step.label}
            </span>
            <span className="mt-1.5 text-[13px] leading-snug text-foreground/90">
              {step.detail}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export type { DiagramId };
