import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(user?.email ?? null);

  useEffect(() => {
    setEmail(user?.email ?? null);
  }, [user]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-6 py-3.5 max-w-6xl sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-8">
            <Link to="/dashboard" className="flex items-center gap-2 text-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground font-serif text-base leading-none">
                C
              </span>
              <span className="truncate font-serif text-lg tracking-tight">Compose</span>
            </Link>
            <nav className="hidden items-center gap-1 text-sm sm:flex">
              <Link
                to="/dashboard"
                activeProps={{ className: "rounded-md px-3 py-1.5 bg-accent text-foreground" }}
                inactiveProps={{ className: "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50" }}
              >
                Dashboard
              </Link>
              <Link
                to="/new"
                activeProps={{ className: "rounded-md px-3 py-1.5 bg-accent text-foreground" }}
                inactiveProps={{ className: "rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent/50" }}
              >
                New piece
              </Link>
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <span className="hidden truncate text-xs text-muted-foreground md:inline">{email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}