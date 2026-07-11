import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import {
  ensureAdminUser,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Compose" },
      { name: "description", content: "Sign in or create a Compose account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ensureAdmin = useServerFn(ensureAdminUser);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    }
  }

  async function handleAdmin() {
    setLoading(true);
    setError(null);
    try {
      await ensureAdmin();
      const { error } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45rem 30rem at 50% 0%, color-mix(in oklab, var(--color-primary) 10%, transparent), transparent 65%)",
        }}
      />
      <div className="relative z-10 w-full max-w-sm space-y-7 rounded-xl border border-border bg-card/70 p-7 text-card-foreground shadow-2xl shadow-black/30 backdrop-blur">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-primary font-serif text-xl text-primary-foreground">
            C
          </div>
          <h1 className="font-serif text-3xl tracking-tight">
            {mode === "signin" ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin"
              ? "Sign in to access your workflow runs."
              : "Sign up with an email and password."}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background/60 px-3 py-2.5 text-sm outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background/60 px-3 py-2.5 text-sm outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading
              ? "Please wait…"
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              or
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background/60 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M23 12.2c0-.8-.1-1.6-.2-2.4H12v4.5h6.2c-.3 1.4-1.1 2.6-2.4 3.4v2.8h3.9c2.3-2.1 3.6-5.2 3.6-8.3z"/>
              <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-4.9H1.3v3.1C3.3 21.4 7.3 24 12 24z"/>
              <path fill="#FBBC05" d="M5.3 14.4c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H1.3C.5 8.6 0 10.2 0 12s.5 3.4 1.3 4.9l4-2.5z"/>
              <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.6 1.3 6.5l4 3.1C6.2 6.9 8.9 4.8 12 4.8z"/>
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            onClick={handleAdmin}
            disabled={loading}
            className="w-full rounded-md border border-dashed border-input bg-transparent px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            Sign in as demo admin
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="block w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {mode === "signin"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}