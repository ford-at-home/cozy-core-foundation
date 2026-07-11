import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMyProfile, saveMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Compose" },
      { name: "description", content: "Your voice and style profile." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const fetchProfile = useServerFn(getMyProfile);
  const save = useServerFn(saveMyProfile);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["profile", "me"],
    queryFn: () => fetchProfile(),
  });

  const [styleText, setStyleText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed the editor once the profile loads; don't clobber in-progress edits.
  useEffect(() => {
    if (!dirty && data?.profile) setStyleText(data.profile.style_text);
  }, [data, dirty]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { profile } = await save({ data: { styleText } });
      queryClient.setQueryData(["profile", "me"], { profile });
      setDirty(false);
      setSavedAt(profile.updated_at);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Studio</p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Your voice</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Describe how you write. This is applied to every piece you compose — it is the
          Voice section of the writing brief. Saved permanently to your profile; never
          committed to any repo. A guided questionnaire will replace this free-text field
          later.
        </p>
      </div>

      <div className="space-y-6 rounded-xl border border-border bg-card p-7 text-card-foreground shadow-sm">
        {isLoading && <p className="text-sm text-muted-foreground">Loading your profile…</p>}
        {error && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        )}

        {!isLoading && !error && (
          <>
            <label className="block space-y-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Style
              </span>
              <textarea
                value={styleText}
                onChange={(e) => {
                  setStyleText(e.target.value);
                  setDirty(true);
                }}
                rows={14}
                placeholder={
                  "How do you open a piece? What do you refuse to sound like? Sentence " +
                  "rhythm, vocabulary you love and hate, how you handle evidence, how you " +
                  "land an ending. Paste examples of lines that sound like you."
                }
                className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 text-sm leading-relaxed outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </label>

            {saveError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saveError}
              </p>
            )}

            <div className="flex items-center justify-between border-t border-border/60 pt-5">
              <p className="text-xs text-muted-foreground">
                {savedAt
                  ? `Saved ${new Date(savedAt).toLocaleString()}`
                  : data?.profile
                    ? `Last updated ${new Date(data.profile.updated_at).toLocaleString()}`
                    : "Not saved yet"}
              </p>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
