import { useState, type FormEvent } from "react";

/**
 * A quiet invitation to follow along. No backend wired yet — the form
 * captures the email locally and displays a single line of acknowledgment.
 * Swap `onSubmit` when a subscription store exists.
 */
export function FollowInvite({
  prompt = "Follow our research & development.",
}: {
  prompt?: string;
}) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setDone(true);
  }

  return (
    <div className="max-w-md">
      <p className="font-serif text-2xl leading-tight text-foreground sm:text-3xl">{prompt}</p>
      {done ? (
        <p className="mt-6 font-serif text-base italic text-muted-foreground">
          Thank you. We'll be in touch when there's something worth telling you about.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
        >
          <label htmlFor="follow-email" className="sr-only">
            Email address
          </label>
          <input
            id="follow-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@somewhere.com"
            className="min-h-11 flex-1 border-0 border-b border-border bg-transparent px-1 py-2 text-base text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:outline-none"
          />
          <button
            type="submit"
            className="min-h-11 shrink-0 border-b border-border px-1 py-2 text-left font-mono text-[11px] uppercase tracking-[0.22em] text-foreground transition-colors hover:border-foreground focus-visible:border-foreground focus-visible:outline-none sm:text-center"
          >
            Follow →
          </button>
        </form>
      )}
    </div>
  );
}