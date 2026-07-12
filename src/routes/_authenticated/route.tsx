import { Link, Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, PenLine, CircleDollarSign, User } from "lucide-react";
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

const NAV_LINKS = [
  { to: "/dashboard" as const, label: "Dashboard", short: "Home", icon: LayoutDashboard },
  { to: "/new" as const, label: "New piece", short: "New", icon: PenLine },
  { to: "/sessions" as const, label: "Cost", short: "Cost", icon: CircleDollarSign },
  { to: "/profile" as const, label: "Profile", short: "Profile", icon: User },
];

const navActive = "rounded-md px-3 py-2 bg-accent text-foreground";
const navInactive =
  "rounded-md px-3 py-2 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header
        className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
          <Link
            to="/dashboard"
            className="flex min-h-11 items-center gap-2 rounded-md text-sm focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary font-serif text-base leading-none text-primary-foreground">
              C
            </span>
            <span className="truncate font-serif text-lg tracking-tight">Compose</span>
          </Link>

          <nav className="hidden items-center gap-1 text-sm sm:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                activeProps={{ className: navActive }}
                inactiveProps={{ className: navInactive }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden max-w-[14rem] truncate text-xs text-muted-foreground md:inline">
              {email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border bg-transparent px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-10 sm:pb-10">
        <Outlet />
      </main>

      {/* Thumb-reach primary nav — mobile first; desktop keeps the header nav. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-4">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.to}>
                <Link
                  to={link.to}
                  activeProps={{
                    className:
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium tracking-wide text-primary",
                  }}
                  inactiveProps={{
                    className:
                      "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium tracking-wide text-muted-foreground transition-colors active:text-foreground",
                  }}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span>{link.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
