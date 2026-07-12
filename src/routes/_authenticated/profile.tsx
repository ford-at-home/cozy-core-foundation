import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getMyProfile, saveMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [imageStyle, setImageStyle] = useState("");
  const [textStylePreset, setTextStylePreset] = useState<string | null>(null);
  const [imageStylePreset, setImageStylePreset] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Dictation state — recording via Web Audio (PCM → WAV) so the upload is a
  // complete decodable file on every browser (Safari MP4 fragments won't).
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dictationError, setDictationError] = useState<{
    message: string;
    hint?: string;
    retryable: boolean;
  } | null>(null);
  // Kept so Retry re-uploads the same recording instead of forcing a re-record.
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);
  const recRef = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    source: MediaStreamAudioSourceNode;
    node: ScriptProcessorNode;
    chunks: Float32Array[];
    sampleRate: number;
  } | null>(null);

  function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      pcm.set(c, offset);
      offset += c.length;
    }
    // Downsample to 16 kHz mono to shrink the upload.
    const target = 16000;
    const ratio = sampleRate / target;
    const outLen = Math.floor(pcm.length / ratio);
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const s = pcm[Math.floor(i * ratio)] ?? 0;
      const v = Math.max(-1, Math.min(1, s));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const buffer = new ArrayBuffer(44 + out.byteLength);
    const view = new DataView(buffer);
    const writeStr = (o: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + out.byteLength, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, target, true);
    view.setUint32(28, target * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, out.byteLength, true);
    new Int16Array(buffer, 44).set(out);
    return new Blob([buffer], { type: "audio/wav" });
  }

  async function startRecording() {
    setDictationError(null);
    setLastBlob(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setDictationError({
        message: "Your browser doesn't support microphone recording.",
        hint: "Try the latest Chrome, Safari, or Firefox — dictation needs a secure (https) context.",
        retryable: false,
      });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setDictationError({
          message: "Microphone access was blocked.",
          hint: "Click the mic icon in your browser's address bar, allow this site, and try again.",
          retryable: true,
        });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setDictationError({
          message: "No microphone was detected.",
          hint: "Plug in or enable a mic in your system settings, then try again.",
          retryable: true,
        });
      } else if (name === "NotReadableError") {
        setDictationError({
          message: "Your mic is being used by another app.",
          hint: "Close other apps or tabs that might be recording, then try again.",
          retryable: true,
        });
      } else {
        setDictationError({
          message: "Couldn't start the microphone.",
          hint: "Refresh the page and try again — if it keeps failing, check your browser's site permissions.",
          retryable: true,
        });
      }
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    recRef.current = { stream, ctx, source, node, chunks, sampleRate: ctx.sampleRate };
    setRecording(true);
  }

  async function stopRecording() {
    const rec = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!rec) return;
    rec.stream.getTracks().forEach((t) => t.stop());
    rec.node.disconnect();
    rec.source.disconnect();
    const blob = encodeWav(rec.chunks, rec.sampleRate);
    await rec.ctx.close();
    if (blob.size < 2048) {
      setDictationError({
        message: "That recording was empty.",
        hint: "Check your mic input level, then hold Dictate for at least a second or two before stopping.",
        retryable: false,
      });
      return;
    }
    setLastBlob(blob);
    await transcribeBlob(blob);
  }

  async function transcribeBlob(blob: Blob) {
    setDictationError(null);
    setTranscribing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setDictationError({
          message: "Your session expired.",
          hint: "Sign in again to keep dictating — your recording is still ready to retry.",
          retryable: true,
        });
        return;
      }
      const fd = new FormData();
      fd.append("file", blob, "recording.wav");
      let res: Response;
      try {
        res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      } catch {
        // fetch() only rejects on a real network failure (offline, DNS, TLS).
        setDictationError({
          message: "Couldn't reach the transcription service.",
          hint: "Check your internet connection, then press Retry — your recording is still here.",
          retryable: true,
        });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        if (res.status === 402) {
          setDictationError({
            message: "Out of AI credits.",
            hint: "Add credits in Workspace Settings → Plans & credits, then press Retry.",
            retryable: true,
          });
        } else if (res.status === 429) {
          setDictationError({
            message: "Transcription is rate-limited right now.",
            hint: "Wait a few seconds, then press Retry.",
            retryable: true,
          });
        } else if (res.status === 401) {
          setDictationError({
            message: "Your session expired.",
            hint: "Sign in again, then press Retry.",
            retryable: true,
          });
        } else if (res.status === 413) {
          setDictationError({
            message: "That recording is too long to transcribe in one go.",
            hint: "Record shorter clips (under ~10 minutes) and dictate them one at a time.",
            retryable: false,
          });
        } else if (res.status >= 500) {
          setDictationError({
            message: "The transcription service hit a temporary error.",
            hint: body.error ? `${body.error} — press Retry in a moment.` : "Press Retry in a moment.",
            retryable: true,
          });
        } else {
          setDictationError({
            message: body.error ?? `Transcription failed (${res.status}).`,
            hint: "Press Retry, or record again if the problem continues.",
            retryable: true,
          });
        }
        return;
      }
      const text = (body.text ?? "").trim();
      if (!text) {
        setDictationError({
          message: "No speech detected in that recording.",
          hint: "Speak closer to the mic and try again.",
          retryable: false,
        });
        return;
      }
      setStyleText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n${text}` : text));
      setDirty(true);
      setLastBlob(null);
      toast.success("Transcription appended to your style");
    } catch (err) {
      setDictationError({
        message: err instanceof Error ? err.message : "Transcription failed unexpectedly.",
        hint: "Press Retry — if it keeps failing, refresh the page and record again.",
        retryable: true,
      });
    } finally {
      setTranscribing(false);
    }
  }

  useEffect(() => {
    return () => {
      const rec = recRef.current;
      if (rec) {
        rec.stream.getTracks().forEach((t) => t.stop());
        rec.node.disconnect();
        rec.source.disconnect();
        void rec.ctx.close();
      }
    };
  }, []);

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
      const { profile } = await save({ data: { styleText, imageStyle } });
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
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Style
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStyleText("");
                      setDirty(true);
                    }}
                    disabled={!styleText}
                    className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    title="Clear the style field"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={recording ? stopRecording : startRecording}
                    disabled={transcribing}
                    className={
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
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
                    {transcribing
                      ? "Transcribing…"
                      : recording
                        ? "Stop recording"
                        : "Dictate"}
                  </button>
                </div>
              </div>
              <PresetChips
                presets={TEXT_STYLE_PRESETS}
                current={styleText}
                onPick={(v) => {
                  setStyleText(v);
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
                className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 text-sm leading-relaxed outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
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
                    onClick={() => void transcribeBlob(lastBlob)}
                    disabled={transcribing}
                    className="mt-2 inline-flex items-center rounded-md border border-destructive/50 bg-background px-2.5 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
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
                    setDirty(true);
                  }}
                  disabled={!imageStyle}
                  className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                  title="Clear the image style field"
                >
                  Clear
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Describe the visual style for images generated with your pieces —
                medium, palette, mood, references. Applied to every image the agent
                creates for a post. Pick a preset below to start, then tweak.
              </p>
              <PresetChips
                presets={IMAGE_STYLE_PRESETS}
                current={imageStyle}
                onPick={(v) => {
                  setImageStyle(v);
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
                className="w-full resize-y rounded-md border border-input bg-background/60 px-3.5 py-3 text-sm leading-relaxed outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-5">
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
                disabled={
                  saving || !dirty || !styleText.trim() || !imageStyle.trim()
                }
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

function PresetChips({
  presets,
  current,
  onPick,
}: {
  presets: { label: string; value: string }[];
  current: string;
  onPick: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => {
        const active = current.trim() === p.value.trim();
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              if (
                current.trim() &&
                !presets.some((q) => q.value.trim() === current.trim()) &&
                !window.confirm("Replace your current text with this preset?")
              ) {
                return;
              }
              onPick(p.value);
            }}
            className={
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " +
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
