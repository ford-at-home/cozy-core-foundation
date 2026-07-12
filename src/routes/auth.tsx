import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

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

const fieldClass =
  "w-full min-h-11 rounded-md border border-input bg-background/60 px-3 py-2.5 text-base outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60 sm:text-sm";

function AuthPage() {
  const navigate = useNavigate();
  const emailId = useId();
  const passwordId = useId();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = loading || googleLoading;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate({ to: "/dashboard" });
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice("Check your email to confirm your account before signing in.");
          setMode("signin");
          return;
        }
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
    if (busy) return;
    setError(null);
    setNotice(null);
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
      });

      if (result.error) throw new Error(result.error.message ?? "Google sign-in failed");
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10"
      style={{
        paddingTop: "max(2.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45rem 30rem at 50% 0%, color-mix(in oklab, var(--color-primary) 10%, transparent), transparent 65%)",
        }}
      />
      <div className="relative z-10 w-full max-w-sm space-y-7 rounded-xl border border-border bg-card/70 p-6 text-card-foreground shadow-2xl shadow-black/30 backdrop-blur sm:p-7">
        <div className="space-y-2 text-center">
          <div
            className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-primary font-serif text-xl text-primary-foreground"
            aria-hidden
          >
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
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <label htmlFor={emailId} className="sr-only">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={passwordId} className="sr-only">
              Password
            </label>
            <input
              id={passwordId}
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className={fieldClass}
            />
          </div>
          {notice && (
            <p
              role="status"
              className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground"
            >
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <div className="relative">
          <div className="absolute inset-0 flex items-center" aria-hidden>
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              or
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          aria-busy={googleLoading}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background/60 px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleLoading ? (
            <Spinner />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M23 12.2c0-.8-.1-1.6-.2-2.4H12v4.5h6.2c-.3 1.4-1.1 2.6-2.4 3.4v2.8h3.9c2.3-2.1 3.6-5.2 3.6-8.3z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-4.9H1.3v3.1C3.3 21.4 7.3 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.3 14.4c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H1.3C.5 8.6 0 10.2 0 12s.5 3.4 1.3 4.9l4-2.5z"
              />
              <path
                fill="#EA4335"
                d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.6 1.3 6.5l4 3.1C6.2 6.9 8.9 4.8 12 4.8z"
              />
            </svg>
          )}
          {googleLoading ? "Opening Google…" : "Continue with Google"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setNotice(null);
          }}
          disabled={busy}
          className="block w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-md disabled:opacity-60"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-current"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
