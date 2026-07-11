import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getMyProfile, saveMyProfile } from "@/lib/profile.functions";
import { supabase } from "@/integrations/supabase/client";

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

  // Dictation state — recording via Web Audio (PCM → WAV) so the upload is a
  // complete decodable file on every browser (Safari MP4 fragments won't).
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [dictationError, setDictationError] = useState<string | null>(null);
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
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setDictationError("Microphone access is needed to dictate.");
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
      setDictationError("That recording was empty — please try again.");
      return;
    }
    setTranscribing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setDictationError("Session expired — sign in again.");
        return;
      }
      const fd = new FormData();
      fd.append("file", blob, "recording.wav");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        setDictationError(body.error ?? `Transcription failed (${res.status})`);
        return;
      }
      const text = (body.text ?? "").trim();
      if (!text) {
        setDictationError("No speech detected — try again.");
        return;
      }
      setStyleText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n\n${text}` : text));
      setDirty(true);
    } catch (err) {
      setDictationError(err instanceof Error ? err.message : "Transcription failed");
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
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Style
                </span>
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
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {dictationError}
              </p>
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
