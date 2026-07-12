import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
// Vendored paper-markup stylesheet; its S{n}P{m} block-anchor counting rule
// must stay in sync with contract/references/MARKUP.md.
import printCss from "@/styles/print.css?raw";

export const Route = createFileRoute("/_authenticated/print/$runId")({
  head: () => ({
    meta: [
      { title: "Print — Compose" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrintPage,
});

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

function extractPost(result: Json | null): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const channels = (result as Record<string, unknown>).channels;
  if (!Array.isArray(channels)) return null;
  for (const ch of channels as Array<Record<string, unknown>>) {
    if (!Array.isArray(ch?.files)) continue;
    for (const f of ch.files as Array<Record<string, unknown>>) {
      if (f?.name === "post.md" && typeof f.content === "string") return f.content;
    }
  }
  return null;
}

function PrintPage() {
  const { runId } = Route.useParams();
  const [post, setPost] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReady, setModalReady] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
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
      console.error("[print] main iframe load timeout", { runId, timeoutMs: IFRAME_LOAD_TIMEOUT_MS });
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
      console.error("[print] modal iframe load timeout", { runId, timeoutMs: IFRAME_LOAD_TIMEOUT_MS });
      toast.error(msg, {
        description: "Close the dialog and try again, or use Cmd/Ctrl+P from the page.",
      });
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [modalOpen, modalReady, runId]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("agent_runs")
      .select("result, status")
      .eq("id", runId)
      .maybeSingle()
      .then(({ data, error }: { data: { result: Json | null; status: string } | null; error: { message: string } | null }) => {
        if (cancelled) return;
        if (error) setError(error.message);
        else if (!data) setError("Run not found.");
        else {
          const content = extractPost(data.result);
          if (content) setPost(content);
          else {
            setError(
              data.status === "completed"
                ? "This run has no printable piece."
                : "This run hasn't completed yet — the piece isn't available to print.",
            );
          }
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Self-contained document: the print stylesheet is global by design (it
  // restyles body, h1, p, ...), so it must not leak into the app. The iframe
  // gives it its own document, with anchors on.
  const srcDoc = useMemo(() => {
    if (!post) return "";
    return [
      "<!doctype html><html><head><meta charset='utf-8'>",
      `<style>${printCss}</style>`,
      "</head><body class='with-anchors'>",
      md.render(post),
      "</body></html>",
    ].join("");
  }, [post]);

  function openPreview() {
    setModalReady(false);
    setModalError(null);
    setModalOpen(true);
  }

  function closePreview() {
    setModalOpen(false);
  }

  function confirmPrint() {
    const win = modalIframeRef.current?.contentWindow;
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

  // Client-side PDF generation using html2pdf.js. Renders the already-loaded
  // preview iframe's <body> so the output matches what the user sees —
  // wide-margin serif layout, S{n}P{m} anchors, and page-break rules from
  // src/styles/print.css.
  async function downloadPdf() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) {
      const msg = "Preview isn't ready yet — try again in a moment.";
      console.error("[print] downloadPdf: iframe document not available", { runId });
      toast.error(msg);
      return;
    }
    setDownloading(true);
    try {
      const { default: html2pdf } = await import("html2pdf.js");
      await html2pdf()
        .from(doc.body)
        .set({
          filename: `compose-run-${runId}.pdf`,
          margin: [1.5, 2, 1.5, 1.5], // top, right, bottom, left (inches)
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
          // `pagebreak` is a valid html2pdf.js option but missing from the
          // shipped .d.ts, so cast to keep strict TS happy.
        } as Parameters<ReturnType<typeof html2pdf>["set"]>[0] & object)
        .set({ pagebreak: { mode: ["avoid-all", "css", "legacy"] } } as never)
        .save();
      toast.success("PDF downloaded.");
    } catch (err) {
      console.error("[print] downloadPdf failed", err);
      toast.error("Couldn't generate the PDF.", {
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setDownloading(false);
    }
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Studio</p>
          <h1 className="mt-1 font-serif text-3xl tracking-tight">Print for markup</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Wide margins for pen work, S{"{n}"}P{"{m}"} anchors pre-printed in the left
            margin so you can dictate references like “S4P3: tighten”.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/runs/$runId"
            params={{ runId }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to run
          </Link>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={!post || !iframeReady || downloading}
            className="rounded-md border border-input bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {downloading ? "Generating PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={openPreview}
            disabled={!post || !iframeReady}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Preview &amp; print…
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
            className="h-[75vh] w-full rounded-lg border border-border bg-white shadow-sm"
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
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPrint}
                  disabled={!modalReady}
                  className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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
                className="h-full w-full rounded-md border border-border bg-white shadow-inner"
              />
            </div>
            <div className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
              Uses your browser's print dialog. Choose <strong>Letter</strong> paper and
              enable <strong>Background graphics</strong> for the S{"{n}"}P{"{m}"} anchors
              to appear.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
