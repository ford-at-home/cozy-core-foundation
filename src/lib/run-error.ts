// Turn a raw provider/edge-function error string into a short student-readable
// explanation. Raw provider bodies (JSON dumps, HTTP traces) must never render
// — the run page keeps the raw text behind its "Technical details" disclosure
// for the site owner. Returns null when there is no error at all.
//
// The recognized phrases mirror the messages written by the backend:
// supabase/functions/_shared/provider.ts (ProviderHttpError),
// _shared/research.ts (dispatch/timeout), _shared/complete.ts (agent status),
// _shared/followup-final.ts (artifact validation), reconcile-runs (agent gone).

export type RunErrorDetail = { title: string; body: string };

export function interpretRunError(raw: string | null | undefined): RunErrorDetail | null {
  if (!raw || !raw.trim()) return null;
  const msg = raw.toLowerCase();

  if (msg.includes("hard limit") || msg.includes("increase your hard limit")) {
    return {
      title: "The research provider's account is over its spending limit.",
      body: "This is a limit on the tool's own billing, not yours — no credits were charged. Please tell the site owner; students cannot fix this themselves.",
    };
  }
  if (
    msg.includes("insufficient_credits") ||
    msg.includes("insufficient credits") ||
    msg.includes("not enough credits")
  ) {
    return {
      title: "You didn't have enough credits when this run tried to start.",
      body: "Add credits from Billing and try again — the earlier attempt cost you nothing.",
    };
  }
  if (msg.includes("exceeded") && msg.includes("minutes")) {
    return {
      title: "The run took too long and was stopped.",
      body: "You were not charged. Start it again — a fresh run usually completes.",
    };
  }
  if (msg.includes("dispatch was never confirmed") || msg.includes("dispatch_unknown")) {
    return {
      title: "The run never confirmed it started.",
      body: "You were not charged. Start it again — if this keeps happening, tell the site owner.",
    };
  }
  if (msg.includes("not found at provider")) {
    return {
      title: "The agent working on this run disappeared.",
      body: "You were not charged. Start the run again.",
    };
  }
  if (msg.includes("file was invalid") || msg.includes("was not published")) {
    return {
      title: "The generated file didn't pass the safety check.",
      body: "It was not published, so you'll never download a broken document. You were not charged — try again.",
    };
  }
  if (msg.includes("provider responded") || msg.includes("agent reported")) {
    return {
      title: "The service running this work rejected the request.",
      body: "This is usually temporary and you were not charged. Try again; if it keeps failing, tell the site owner.",
    };
  }
  if (msg.includes("cancel")) {
    return {
      title: "This run was cancelled.",
      body: "Any credit held for it was released — you were not charged.",
    };
  }
  // Unknown error: generic guidance only. The raw text stays in the run
  // page's technical-details disclosure so nothing is lost for debugging.
  return {
    title: "The run stopped with an error.",
    body: "You were not charged — any credit held was released. Try again; if it keeps failing, the technical details on the run page can help the site owner.",
  };
}
