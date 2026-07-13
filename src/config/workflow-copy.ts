// Single source of truth for the user-facing product story.
//
// Every top-level surface (landing, /new, dashboard, project hub) pulls
// copy from here so the six shared verbs and the promise stay consistent.
// Deep pages (return, review, followup, runs) can also import from this
// file when their copy is refreshed.
//
// Rule: no marketing hyperbole, no invented capability. If a string here
// describes something the app can't actually do, delete the string or
// change the code — never the other way around.

import { brand } from "@/config/brand";

/** One-sentence product promise. */
export const PROMISE =
  `${brand.company.name} helps you research a subject with AI, print a working ` +
  `hardcopy, think and mark it up by hand, return your notes, and turn that ` +
  `work into a refined Word document, class presentation, or merged draft.`;

/** Short (≈40–70 word) product description for meta and landing kicker. */
export const SHORT_DESCRIPTION =
  "Start with a question. Research it with AI, print a working hardcopy, and " +
  "step away from the screen. Mark the pages up by hand, then return your " +
  "notes — by photo, dictation, or typed transcript. The system reconciles " +
  "your thinking into a Word document, a class presentation, or a merged " +
  "draft in your voice.";

/** What the human is doing at each shared stage. Same six verbs in both workflows. */
export const HOW_IT_WORKS: { step: string; body: string }[] = [
  {
    step: "Explore",
    body: "Bring a question or your existing notes. AI gathers sources and organizes the material — or prepares a working draft in your voice, depending on what you're making.",
  },
  {
    step: "Print",
    body: "Generate a clean hardcopy with wide margins and small anchors on every block, so any part of the page is easy to point at later.",
  },
  {
    step: "Think",
    body: "Read the pages wherever you think best. Underline, cross out, star, question, and write direction in the margins. Nothing is happening in the app while you do this.",
  },
  {
    step: "Return",
    body: "Bring your work back — photograph the annotated pages, dictate your notes, or paste an annotation transcript. Simple shorthand like “S4P3: tighten” is enough.",
  },
  {
    step: "Refine",
    body: "The system reconciles the research, your annotations, and any follow-up questions. For a study packet, it re-researches what you flagged; for a draft, it produces the next version.",
  },
  {
    step: "Finish",
    body: "Leave with a Word document, a class presentation, a merged draft — whichever your project produces. Every output preserves your own words verbatim and every source as a link.",
  },
];

/** Load-bearing "what AI does / doesn't do" contract shown on landing and /new. */
export const AI_WILL_DO: string[] = [
  "Gather and organize research, with sources cited.",
  "Read your returned pages and dictation — and show you what it read.",
  "Research the follow-up questions you approve.",
  "Assemble the final Word document and presentation from verified material.",
];

export const AI_WONT_DO: string[] = [
  "Supply your experience, your judgment, or your reading of the material.",
  "Silently invent personal reflection you didn't write.",
  "Treat uncertain handwriting as confirmed — you always review.",
  "Move work forward without a verified next step from you.",
];

/** Credit narrative — one place, matches docs/BILLING.md. */
export const CREDIT_COPY =
  "One credit prepares a working draft or a research packet. A focused " +
  "follow-up research pass uses two credits and covers up to three approved " +
  "questions. Word document and presentation each use their own credits when " +
  "you create them. Printing, reviewing, correcting, dictating, and " +
  "downloading are always free, and nothing is charged for work that fails.";

/** Two intent-framed modes on /new — one honest sentence each. */
export const MODE_COPY = {
  longform: {
    label: "Draft a piece in my voice",
    intent:
      "You bring what you know (or ask AI to research it); AI drafts it in your voice, and you revise the marked-up pages together until you approve.",
    arc: "Explore → Print → Think → Return → Refine → Finish",
    outcome: "Ends with a revised draft merged to your repo.",
  },
  research_packet: {
    label: "Study a subject and write from it",
    intent:
      "AI prepares a working packet — research findings plus questions written for what it found. You think on paper, return your notes, and AI helps you finish the paper and slides.",
    arc: "Explore → Print → Think → Return → Review → Follow up → Finish",
    outcome: "Ends with a Word document and (optionally) a class presentation.",
  },
} as const;

/** Short transition copy per stage — reused across hubs. */
export const STAGE_TRANSITIONS: Record<
  "explore" | "print" | "think" | "return" | "review" | "follow_up" | "finish",
  string
> = {
  explore:
    "AI is gathering sources and preparing your working material. You can close this page — the work continues, and the project picks up where it left off.",
  print:
    "Your material is ready. Print it when you're ready to step away from the screen; reviewing and printing are free.",
  think:
    "Work through the pages at your own pace. When you're done, return your work — by photo, by dictation, or both.",
  return:
    "Send your pages and any dictation. You can leave and come back; nothing is lost, and returning is free.",
  review:
    "Handwriting can be ambiguous. Confirm what the system read before it feeds the next step. Only your approved words move forward.",
  follow_up:
    "Optional: approve up to three follow-up research questions and AI runs a focused second pass. Or skip and go straight to the final materials.",
  finish:
    "Your work is ready to become a final artifact. Choose what to create; downloads are free.",
};
