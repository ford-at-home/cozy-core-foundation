import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMyProfile, saveMyProfile } from "@/lib/profile.functions";
import { useDictation } from "@/hooks/use-dictation";
import { toast } from "sonner";
import { brand, pageTitle } from "@/config/brand";

const TEXT_STYLE_PRESETS: { label: string; value: string }[] = [
  {
    label: "Plainspoken essayist",
    value:
      "Short sentences. Concrete nouns. One idea per paragraph. No throat-clearing openers, no windup — start on the observation and let the piece breathe. Prefer verbs over adjectives. When a sentence can be cut in half without losing meaning, cut it. End on a line that stands on its own.",
  },
  {
    label: "Punchy operator",
    value:
      "First person, direct, opinionated. Talk like you're writing to one smart friend who's short on time. Contractions welcome. Every section ends with a single takeaway line — italicized or on its own paragraph — that the reader could quote back a week later. No hedging, no 'it depends' unless followed by a decision rule.",
  },
  {
    label: "Warm storyteller",
    value:
      "Open with a scene, not a thesis: a place, a person, a small moment. Use sensory detail — what you saw, heard, held. Let the point emerge from the story rather than announcing it. Quiet endings; no drum-roll. Contractions and second person are welcome when they earn intimacy.",
  },
  {
    label: "Analytical explainer",
    value:
      "Define terms the first time you use them. Structure with numbered steps or clear headings when the logic branches. Cite evidence inline (numbers, dates, sources) rather than gesturing at 'studies show'. Distinguish claims from opinions explicitly. End with the strongest counter-argument you can steelman, then the reason it doesn't win.",
  },
  {
    label: "Dry wit",
    value:
      "Understated, observational, occasionally arch. One aside per section, never more. Never sarcastic for its own sake — the humor has to reveal something true about the subject. Prefer specificity over cleverness. Land the piece on a clean, quiet line; no punchline endings.",
  },
];

const IMAGE_STYLE_PRESETS: { label: string; value: string }[] = [
  {
    label: "Ink & wash journal",
    value:
      "Hand-drawn ink on off-white paper, loose confident linework, muted watercolor washes, generous margins, feels like a naturalist's field journal. Never photorealistic, never glossy 3D, no neon.",
  },
  {
    label: "Editorial photo",
    value:
      "35mm color photograph, natural available light, shallow depth of field, documentary framing, subtle grain. Neutral palette, no heavy filters, no stock-photo staging.",
  },
  {
    label: "Flat vector",
    value:
      "Flat geometric shapes, 3–4 color palette per image, thick consistent outlines, no gradients, no textures. Modern editorial illustration feel — think a smart magazine's op-ed art.",
  },
  {
    label: "Risograph print",
    value:
      "Two-color risograph print on warm paper stock, visible grain and slight misregistration, limited palette (e.g. fluorescent pink + navy). Analog print texture, no photorealism.",
  },
  {
    label: "Minimal line art",
    value:
      "Single-weight black line on white, generous whitespace, no shading, no fills. Confident continuous strokes, spare composition, one subject centered.",
  },
];

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: pageTitle("Profile") },
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
  const [imageStyle, setImageStyle] = useState("");
  const [textStylePreset, setTextStylePreset] = useState<string | null>(null);
  const [imageStylePreset, setImageStylePreset] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Dictation via the shared hook (recording + /api/transcribe); the
  // transcript is appended to the style text.
  const {
    recording,
    transcribing,
    error: dictationError,
    lastBlob,
    start: startRecording,
    stop: stopRecording,
    retry: retryTranscription,
  } = useDictation((text) => {
    setStyleText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n${text}` : text));
    setDirty(true);
    toast.success("Transcription appended to your style");
  });

  // Seed the editor once the profile loads; don't clobber in-progress edits.
  useEffect(() => {
    if (!dirty && data?.profile) {
      setStyleText(data.profile.style_text);
      setImageStyle(data.profile.image_style ?? "");
      setTextStylePreset(data.profile.text_style_preset ?? null);
      setImageStylePreset(data.profile.image_style_preset ?? null);
    }
  }, [data, dirty]);

  async function handleSave() {
    const trimmedStyle = styleText.trim();
    const trimmedImage = imageStyle.trim();
    if (!trimmedStyle || !trimmedImage) {
      setSaveError("Both Style and Image style are required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const { profile } = await save({
        data: {
          styleText,
          imageStyle,
          textStylePreset,
          imageStylePreset,
        },
      });
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
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {brand.product.name}
        </p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight sm:text-5xl">Your voice</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Describe how you write. This is applied to every draft you prepare — it is the Voice
          section of the writing brief. Saved permanently to your profile; never committed to any
          repo. A guided questionnaire will replace this free-text field later.
        </p>
      </div>

      <div className="space-y-6 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-7">
        {isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading profile">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-40 w-full animate-pulse rounded-md bg-muted" />
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error.message}
          </p>
        )}

        {!isLoading && !error && (
          <>
            <label className="block space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Style
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStyleText("");
                      setTextStylePreset(null);
                      setDirty(true);
                    }}
                    disabled={!styleText && !textStylePreset}
                    className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    title="Clear the style field"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={transcribing}
                    className={
                      "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-50 " +
                      (recording
                        ? "border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15"
                        : "border-border bg-background hover:bg-muted")
                    }
                    aria-pressed={recording}
                    title={recording ? "Stop and transcribe" : "Dictate with your voice"}
                  >
                    <span
                      aria-hidden
                      className={
                        "h-1.5 w-1.5 rounded-full " +
                        (recording ? "animate-pulse bg-destructive" : "bg-muted-foreground")
                      }
                    />
                    {transcribing ? "Transcribing…" : recording ? "Stop recording" : "Dictate"}
                  </button>
                </div>
              </div>
              <PresetChips
                presets={TEXT_STYLE_PRESETS}
                current={styleText}
                selectedPreset={textStylePreset}
                onPick={(v, label) => {
                  setStyleText(v);
                  setTextStylePreset(label);
                  setDirty(true);
                }}
              />
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
                className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
              />
            </label>

            {dictationError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              >
                <p className="font-medium">{dictationError.message}</p>
                {dictationError.hint && (
                  <p className="mt-1 text-xs leading-relaxed text-destructive/85">
                    {dictationError.hint}
                  </p>
                )}
                {dictationError.retryable && lastBlob && (
                  <button
                    type="button"
                    onClick={retryTranscription}
                    disabled={transcribing}
                    className="mt-2 inline-flex min-h-11 items-center rounded-md border border-destructive/50 bg-background px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {transcribing ? "Retrying…" : "Retry transcription"}
                  </button>
                )}
              </div>
            )}
            {recording && !dictationError && (
              <p className="text-xs text-muted-foreground">
                Recording… speak freely, then press Stop to transcribe and append.
              </p>
            )}

            {saveError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {saveError}
              </p>
            )}

            <label className="block space-y-2 border-t border-border/60 pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Image style
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setImageStyle("");
                    setImageStylePreset(null);
                    setDirty(true);
                  }}
                  disabled={!imageStyle && !imageStylePreset}
                  className="inline-flex min-h-11 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  title="Clear the image style field"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Describe the visual style for images generated with your drafts — medium, palette,
                mood, references. Applied to every image the agent creates for a post. Pick a preset
                below to start, then tweak.
              </p>
              <PresetChips
                presets={IMAGE_STYLE_PRESETS}
                current={imageStyle}
                selectedPreset={imageStylePreset}
                onPick={(v, label) => {
                  setImageStyle(v);
                  setImageStylePreset(label);
                  setDirty(true);
                }}
              />
              <textarea
                value={imageStyle}
                onChange={(e) => {
                  setImageStyle(e.target.value);
                  setDirty(true);
                }}
                rows={5}
                placeholder={
                  "e.g. hand-drawn ink and wash on off-white paper, minimal palette, " +
                  "loose linework in the style of a nature journal — never photorealistic, " +
                  "never glossy 3D renders."
                }
                className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 text-base leading-relaxed outline-none transition-shadow focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-sm"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {savedAt
                    ? `Saved ${new Date(savedAt).toLocaleString()}`
                    : data?.profile
                      ? `Last updated ${new Date(data.profile.updated_at).toLocaleString()}`
                      : "Not saved yet"}
                </p>
                {(!styleText.trim() || !imageStyle.trim()) && (
                  <p className="text-xs text-muted-foreground">
                    Both Style and Image style are required.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty || !styleText.trim() || !imageStyle.trim()}
                aria-busy={saving}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 sm:w-auto"
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

function PresetChips({
  presets,
  current,
  selectedPreset,
  onPick,
}: {
  presets: { label: string; value: string }[];
  current: string;
  selectedPreset: string | null;
  onPick: (value: string, label: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => {
        const active = selectedPreset === p.label || current.trim() === p.value.trim();
        return (
          <button
            key={p.label}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (
                current.trim() &&
                !presets.some((q) => q.value.trim() === current.trim()) &&
                !window.confirm("Replace your current text with this preset?")
              ) {
                return;
              }
              onPick(p.value, p.label);
            }}
            className={
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 " +
              (active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background hover:bg-muted")
            }
            title={p.value}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
