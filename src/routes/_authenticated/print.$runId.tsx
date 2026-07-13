import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  buildPacketPrintDocument,
  buildPrintDocument,
  extractPost,
  type PacketPrintQuestion,
} from "@/lib/print-document";
import { getPacketByRunId, listPacketQuestions } from "@/lib/packets";
import { brand, pageTitle } from "@/config/brand";

export const Route = createFileRoute("/_authenticated/print/$runId")({
  head: () => ({
    meta: [{ title: pageTitle("Print") }, { name: "robots", content: "noindex" }],
  }),
  component: PrintPage,
});

// Packet runs print through the packet builder: the reviewed questions (with
// their writing space) come from the packets tables so review-screen edits
// show up on paper without regenerating anything.
type PacketPrintInfo = { packetId: string; version: number; questions: PacketPrintQuestion[] };

function PrintPage() {
  const { runId } = Route.useParams();
  const [post, setPost] = useState<string | null>(null);
  const [packetInfo, setPacketInfo] = useState<PacketPrintInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReady, setModalReady] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const modalIframeRef = useRef<HTMLIFrameElement>(null);

  // Watchdog: if a print iframe doesn't fire `load` within this many ms after
  // its srcDoc is set, treat it as a load failure and surface a toast. srcDoc
  // iframes usually load synchronously, so exceeding this budget almost
  // always means a browser extension, CSP, or memory pressure blocked it.
  const IFRAME_LOAD_TIMEOUT_MS = 8000;

  // Main on-page preview iframe watchdog.
  useEffect(() => {
    if (!post || iframeReady) return;
    const t = window.setTimeout(() => {
      if (iframeReady) return;
      const msg = "Print preview didn't load in time.";
      setIframeError(msg);
      console.error("[print] main iframe load timeout", {
        runId,
        timeoutMs: IFRAME_LOAD_TIMEOUT_MS,
      });
      toast.error(msg, {
        description: "Try reloading the page, or use the fallback new-window print.",
      });
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [post, iframeReady, runId]);

  // Modal iframe watchdog (re-armed each time the modal opens).
  useEffect(() => {
    if (!modalOpen) return;
    if (modalReady) return;
    const t = window.setTimeout(() => {
      if (modalReady) return;
      const msg = "Print preview didn't load in the modal.";
      setModalError(msg);
      console.error("[print] modal iframe load timeout", {
        runId,
        timeoutMs: IFRAME_LOAD_TIMEOUT_MS,
      });
      toast.error(msg, {
        description: "Close the dialog and try again, or use Cmd/Ctrl+P from the page.",
      });
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [modalOpen, modalReady, runId]);

  useEffect(() => {
    let cancelled = false;
    setPost(null);
    setPacketInfo(null);
    setError(null);
    setLoading(true);
    setIframeReady(false);
    setIframeError(null);
    setModalOpen(false);
    setModalReady(false);
    setModalError(null);

    async function load() {
      const { data, error } = (await supabase
        .from("agent_runs")
        .select("result, status, kind")
        .eq("id", runId)
        .maybeSingle()) as {
        data: { result: Json | null; status: string; kind: string } | null;
        error: { message: string } | null;
      };
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else if (!data) {
        setError("Run not found.");
      } else {
        const content = extractPost(data.result);
        if (content) {
          if (data.kind === "packet") {
            // Reviewed questions come from the packets tables. A missing
            // packet row (persistence flagged a problem) still prints the
            // body with the follow-up section, so paper is never blocked.
            try {
              const packet = await getPacketByRunId(runId);
              if (cancelled) return;
              if (packet) {
                const questions = await listPacketQuestions(packet.id);
                if (cancelled) return;
                setPacketInfo({
                  packetId: packet.id,
                  version: packet.version,
                  questions: questions.map((q) => ({
                    position: q.position,
                    function: q.function,
                    claim_ref: q.claim_ref,
                    prompt: q.prompt,
                    guidance: q.guidance,
                    response_space: q.response_space,
                  })),
                });
              } else {
                setPacketInfo({ packetId: runId, version: 1, questions: [] });
              }
            } catch {
              setPacketInfo({ packetId: runId, version: 1, questions: [] });
            }
          }
          setPost(content);
          setError(null);
        } else {
          setError(
            data.status === "completed"
              ? "This run has no printable piece."
              : "This run hasn't completed yet — the piece isn't available to print.",
          );
        }
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Self-contained document (fonts, stylesheet, and page furniture inlined by
  // buildPrintDocument) rendered in an iframe so the print styles — which
  // restyle body, h1, p, ... — can't leak into the app. The same document is
  // what the browser's print engine paginates, so screen preview, print
  // preview, Save-as-PDF, and paper all share one renderer.
  const srcDoc = useMemo(() => {
    if (!post) return "";
    if (packetInfo) {
      return buildPacketPrintDocument(post, packetInfo.questions, {
        packetId: packetInfo.packetId,
        version: packetInfo.version,
      });
    }
    return buildPrintDocument(post);
  }, [post, packetInfo]);

  function openPreview() {
    setModalReady(false);
    setModalError(null);
    setModalOpen(true);
  }

  function closePreview() {
    setModalOpen(false);
  }

  // Open the native print dialog for the rendered document. Saving as PDF
  // happens in the same dialog ("Save as PDF" destination): the browser's
  // print engine produces vector, selectable-text output with embedded fonts
  // that is identical to the paper output, which no DOM-screenshot PDF
  // library can match.
  function printDocument(frame: HTMLIFrameElement | null) {
    const win = frame?.contentWindow;
    try {
      if (!win) throw new Error("iframe not ready");
      win.focus();
      win.print();
    } catch {
      console.error("[print] direct iframe print failed; falling back to new window", { runId });
      toast.warning("Opening the print dialog in a new window instead.", {
        description: "Your browser blocked printing from the embedded preview.",
      });
      // Fallback: some browsers block print() on srcDoc iframes.
      // Open the rendered document in a new window and print from there.
      const w = window.open("", "_blank");
      if (!w) {
        const msg = "Popup blocked — allow popups to print this page.";
        console.error("[print] popup blocked");
        toast.error(msg);
        return;
      }
      w.document.open();
      w.document.write(srcDoc);
      w.document.close();
      w.focus();
      setTimeout(() => {
        try {
          w.print();
        } catch {
          console.error("[print] fallback window print failed");
          toast.error("Couldn't open the print dialog automatically.", {
            description: "Press Cmd/Ctrl+P in the new window to print.",
          });
          /* user can Ctrl/Cmd+P in the opened window */
        }
      }, 250);
    }
  }

  function savePdf() {
    toast.info("Choose “Save as PDF” as the destination in the print dialog.");
    printDocument(iframeRef.current);
  }

  function confirmPrint() {
    printDocument(modalIframeRef.current);
  }

  // Close the modal on Escape.
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {brand.product.name}
          </p>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">Print for markup</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Wide margins for pen work, with S{"{n}"}P{"{m}"} anchors in the left margin so you can
            dictate references like “S4P3: tighten”.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Link
            to="/runs/$runId"
            params={{ runId }}
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 rounded-sm sm:min-h-0"
          >
            ← Back to run
          </Link>
          <button
            type="button"
            onClick={savePdf}
            disabled={!post || !iframeReady}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
          >
            Save as PDF
          </button>
          <button
            type="button"
            onClick={openPreview}
            disabled={!post || !iframeReady}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50 sm:w-auto"
          >
            Preview &amp; print…
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground" aria-busy="true">
          Loading preview…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {post && (
        <>
          {iframeError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {iframeError} Try reloading the page.
            </p>
          )}
          <iframe
            ref={iframeRef}
            title="Print preview"
            srcDoc={srcDoc}
            onLoad={() => {
              setIframeReady(true);
              setIframeError(null);
            }}
            onError={() => {
              const msg = "Failed to render the print preview.";
              console.error("[print] main iframe onError", { runId });
              setIframeError(msg);
              toast.error(msg);
            }}
            className="h-[80vh] w-full rounded-lg border border-border shadow-sm"
          />
        </>
      )}

      {modalOpen && post && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 sm:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreview();
          }}
        >
          <div className="flex h-full max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Confirm before printing
                </p>
                <h2 id="print-preview-title" className="font-serif text-xl tracking-tight">
                  Print preview
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closePreview}
                  className="inline-flex min-h-11 items-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPrint}
                  disabled={!modalReady}
                  className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {modalReady ? "Confirm & print" : "Preparing…"}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden bg-neutral-200 p-3 sm:p-6">
              {modalError && (
                <p
                  role="alert"
                  className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {modalError} You can close this dialog and retry.
                </p>
              )}
              <iframe
                ref={modalIframeRef}
                title="Print preview (modal)"
                srcDoc={srcDoc}
                onLoad={() => {
                  setModalReady(true);
                  setModalError(null);
                }}
                onError={() => {
                  const msg = "Failed to render the print preview.";
                  console.error("[print] modal iframe onError", { runId });
                  setModalError(msg);
                  toast.error(msg);
                }}
                className="h-full w-full rounded-md border border-border shadow-inner"
              />
            </div>
            <div className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              Uses your browser's print dialog. Keep paper size <strong>Letter</strong> and margins{" "}
              <strong>Default</strong>; to keep a digital copy, pick <strong>Save as PDF</strong> as
              the destination.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
