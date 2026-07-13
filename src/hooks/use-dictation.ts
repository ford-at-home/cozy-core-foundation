// Reusable dictation hook: record via Web Audio (PCM → WAV so the upload is
// a complete decodable file on every browser — Safari MP4 fragments won't),
// then transcribe through /api/transcribe. Extracted from profile.tsx so the
// packet-return flow reuses the exact same recording + error handling.

import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type DictationError = {
  message: string;
  hint?: string;
  retryable: boolean;
};

export function useDictation(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<DictationError | null>(null);
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

  async function start() {
    setError(null);
    setLastBlob(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError({
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
        setError({
          message: "Microphone access was blocked.",
          hint: "Click the mic icon in your browser's address bar, allow this site, and try again.",
          retryable: true,
        });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError({
          message: "No microphone was detected.",
          hint: "Plug in or enable a mic in your system settings, then try again.",
          retryable: true,
        });
      } else if (name === "NotReadableError") {
        setError({
          message: "Your mic is being used by another app.",
          hint: "Close other apps or tabs that might be recording, then try again.",
          retryable: true,
        });
      } else {
        setError({
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
    // Mute before destination so the processor stays alive without speaker echo.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    recRef.current = { stream, ctx, source, node, chunks, sampleRate: ctx.sampleRate };
    setRecording(true);
  }

  async function stop() {
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
      setError({
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
    setError(null);
    setTranscribing(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setError({
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
        setError({
          message: "Couldn't reach the transcription service.",
          hint: "Check your internet connection, then press Retry — your recording is still here.",
          retryable: true,
        });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) {
        if (res.status === 402) {
          setError({
            message: "Dictation is out of workspace AI credits.",
            hint: "Dictation bills workspace AI credits — separate from the generation credits on your Billing page. Add AI credits in Workspace Settings → Plans & credits, then press Retry.",
            retryable: true,
          });
        } else if (res.status === 429) {
          setError({
            message: "Transcription is rate-limited right now.",
            hint: "Wait a few seconds, then press Retry.",
            retryable: true,
          });
        } else if (res.status === 401) {
          setError({
            message: "Your session expired.",
            hint: "Sign in again, then press Retry.",
            retryable: true,
          });
        } else if (res.status === 413) {
          setError({
            message: "That recording is too long to transcribe in one go.",
            hint: "Record shorter clips (under ~10 minutes) and dictate them one at a time.",
            retryable: false,
          });
        } else if (res.status >= 500) {
          setError({
            message: "The transcription service hit a temporary error.",
            hint: body.error
              ? `${body.error} — press Retry in a moment.`
              : "Press Retry in a moment.",
            retryable: true,
          });
        } else {
          setError({
            message: body.error ?? `Transcription failed (${res.status}).`,
            hint: "Press Retry, or record again if the problem continues.",
            retryable: true,
          });
        }
        return;
      }
      const text = (body.text ?? "").trim();
      if (!text) {
        setError({
          message: "No speech detected in that recording.",
          hint: "Speak closer to the mic and try again.",
          retryable: false,
        });
        return;
      }
      setLastBlob(null);
      onTranscript(text);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : "Transcription failed unexpectedly.",
        hint: "Press Retry — if it keeps failing, refresh the page and record again.",
        retryable: true,
      });
    } finally {
      setTranscribing(false);
    }
  }

  return {
    recording,
    transcribing,
    error,
    lastBlob,
    start,
    stop,
    retry: () => (lastBlob ? transcribeBlob(lastBlob) : Promise.resolve()),
  };
}
