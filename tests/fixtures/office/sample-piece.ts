// Safe, fully fictional research-piece fixture for the final DOCX/PPTX
// sample generators (tests/office-samples.ts). Mirrors the content model the
// final-artifact prompts assemble (goal, findings + sources, verified
// student responses, follow-up evidence, uncertainties) without any real
// user data. Thematically consistent with tests/fixtures/representative.md.

export interface SampleFinding {
  /** Short assertion — doubles as the slide title. */
  headline: string;
  /** 2–4 sentence body paragraph for the document. */
  body: string;
  /** ≤40-word bullet points for the slide. */
  bullets: string[];
  source: { label: string; url: string };
}

export const samplePiece = {
  title: "The Quiet Cost of Orphaned Tools",
  studentName: "Jordan Sample",
  date: "July 13, 2026",
  researchQuestion:
    "Why do internal tools lose their owners after reorganizations, and what does that cost?",
  whyItMatters: [
    "Orphaned tools fail silently in exactly the situations they were built to catch.",
    "The indirect costs — duplicate rebuilds, trust erosion — never appear in a budget line.",
    "One ownership question predicts survival better than any process change.",
  ],
  executiveSummary:
    "Internal tools rarely die loudly. They fade: a dashboard nobody refreshes, a cron " +
    "job whose author left two reorganizations ago. This study traced how ownership " +
    "dilutes after a reorg and what that costs. Three findings stand out. First, " +
    "reorgs dilute rather than delete ownership — the team still exists on paper while " +
    "the person who understood the failure modes works three layers away. Second, the " +
    "visible costs (incident archaeology) are dwarfed by invisible ones: duplicate " +
    "rebuilds and quarterly-compounding trust erosion. Third, survival is predicted by " +
    "a single question — whether a specific person, not a rotation, gets paged. " +
    "Follow-up research confirmed the pattern in two additional case studies and " +
    "sharpened the uncertainty: causation between naming an owner and tool survival " +
    "remains unproven. The next step is a structured interview with a platform team " +
    "that has survived three reorganizations.",
  findings: [
    {
      headline: "Reorgs dilute ownership instead of deleting it",
      body:
        "After a reorganization the owning team still exists on paper, but the person " +
        "who understood the failure modes works three layers away and the inheriting " +
        "team holds the pager without the context. Postmortems repeatedly show the " +
        "same three patterns: happy-path documentation, monitoring pointed at dead " +
        "channels, and 'owners' that are teams rather than people.",
      bullets: [
        "The owning team survives on paper; the understanding does not",
        "Pagers transfer without context",
        "Postmortems show the same three patterns",
      ],
      source: {
        label: "Internal Tools Survey 2026 (fictional)",
        url: "https://example.com/internal-tools-survey",
      },
    },
    {
      headline: "The invisible costs dwarf the visible ones",
      body:
        "Incident archaeology is easy to count in days. The larger costs never appear " +
        "in a budget: teams that cannot confidently modify an orphaned tool build a " +
        "parallel one, and trust in shared infrastructure erodes a little every " +
        "quarter. The rebuild pattern doubles the maintenance surface while halving " +
        "the ownership.",
      bullets: [
        "Incident archaeology: days per incident, after the fact",
        "Duplicate rebuilds: one every two years",
        "Trust erosion compounds quarterly and is never itemized",
      ],
      source: {
        label: "Platform Cost Postmortems (fictional)",
        url: "https://example.com/platform-postmortems",
      },
    },
    {
      headline: "One question predicts survival: who gets paged?",
      body:
        "Tools survive when a specific human can say 'mine.' If the handoff meeting " +
        "names a rotation instead of a person, the tool is already orphaned — the " +
        "paperwork just hasn't caught up. Teams that keep tools alive write runbooks " +
        "as executable commands, not narratives, so the next person can act before " +
        "they understand.",
      bullets: [
        "A rotation is not an owner",
        "Executable runbooks outlive their authors",
        "Naming one person beats adding process",
      ],
      source: {
        label: "Ownership Handoff Case Studies (fictional)",
        url: "https://example.com/handoff-cases",
      },
    },
  ] satisfies SampleFinding[],
  verifiedResponses: [
    {
      prompt: "Before reading this evidence, what did you believe about tool ownership?",
      response:
        "I assumed tools mostly break because of technical debt. I had not considered " +
        "that the person who knew the failure modes simply stops being asked.",
    },
    {
      prompt: "Which claim has the weakest evidence, and what would strengthen it?",
      response:
        "The trust-erosion claim. It compounds quarterly in the survey data, but " +
        "nobody measured it directly — an engineer confidence survey across two " +
        "reorgs would strengthen it.",
    },
  ],
  followupFindings: {
    headline: "Second-pass evidence confirmed the pattern",
    body:
      "Two additional case studies located in follow-up research showed the same " +
      "arc: ownership diluted within two quarters of a reorg, and the tool's first " +
      "silent failure followed within a year. Neither case established causation.",
    source: {
      label: "Follow-up Case Studies (fictional)",
      url: "https://example.com/followup-cases",
    },
  },
  uncertainties: [
    "Causation is unproven: naming a single owner may correlate with healthier teams rather than cause tool survival.",
    "All evidence comes from postmortems, which oversample failures.",
  ],
  nextSteps: [
    "Interview a platform team that survived three reorganizations with the same tool owner.",
    "Design a lightweight engineer-confidence survey to measure trust erosion directly.",
  ],
  sources: [
    {
      label: "Internal Tools Survey 2026 (fictional)",
      url: "https://example.com/internal-tools-survey",
    },
    {
      label: "Platform Cost Postmortems (fictional)",
      url: "https://example.com/platform-postmortems",
    },
    {
      label: "Ownership Handoff Case Studies (fictional)",
      url: "https://example.com/handoff-cases",
    },
    { label: "Follow-up Case Studies (fictional)", url: "https://example.com/followup-cases" },
  ],
};

export type SamplePiece = typeof samplePiece;
