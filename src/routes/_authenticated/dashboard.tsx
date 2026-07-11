import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyRuns } from "@/lib/workflows.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Compose" },
      { name: "description", content: "Your recent workflow runs." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const fetchRuns = useServerFn(listMyRuns);
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workflow_runs", "recent"],
    queryFn: () => fetchRuns(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your 20 most recent workflow runs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.navigate({ to: "/new" })}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          New piece
        </button>
      </div>

      {/* INSERT: dashboard UI from migrated app goes here. Keep using listMyRuns. */}

      <div className="rounded-lg border border-border bg-card text-card-foreground">
        {isLoading && (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        )}
        {error && (
          <div className="p-6 text-sm text-destructive">
            Could not load runs.
          </div>
        )}
        {!isLoading && !error && (data?.runs.length ?? 0) === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            No runs yet. Start one from the New piece page.
          </div>
        )}
        {!isLoading && !error && (data?.runs.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {data!.runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{r.workflow_type}</td>
                  <td className="px-4 py-2">{r.status}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                    {r.id.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}