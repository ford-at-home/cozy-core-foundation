// Research-packet persistence (Phase 1 of docs/research-workflow/).
//
// A completed packet run (kind='packet') commits three files:
//   pieces/<slug>/packet/packet.md      — the printable body
//   pieces/<slug>/packet/analysis.json  — structured research model
//   pieces/<slug>/packet/questions.json — tailored Socratic questions
//
// fetchRunResult packs them into the run result; this module validates the
// JSON and persists packets + packet_questions rows. Called BEFORE the run
// is marked completed, so a failure here leaves the run in awaiting_fetch
// and the reconciler retries. Everything is idempotent: the packet upserts
// on the unique run_id, and questions insert with ignore-duplicates on
// (packet_id, position) so a webhook/reconciler race or a redelivery can
// never duplicate rows or overwrite the owner's later edits.

// deno-lint-ignore-file no-explicit-any

export const QUESTION_FUNCTIONS = [
  "prior_belief",
  "stakes",
  "evidence_integrity",
  "missing_perspective",
  "ground_truth",
  "expert_interrogation",
  "counterargument",
  "definition_framing",
  "action",
  "followup",
] as const;

export const RESPONSE_SPACES = ["lines_3", "lines_5", "third_page", "half_page", "box"] as const;

export interface PacketQuestion {
  position: number;
  function: (typeof QUESTION_FUNCTIONS)[number];
  claim_ref: string;
  prompt: string;
  guidance: string | null;
  response_space: (typeof RESPONSE_SPACES)[number];
}

// Generic worksheet prompts are prohibited as final questions
// (docs/research-workflow/02-…). Compared after normalization.
const PROHIBITED_GENERIC = [
  "what would prove this research wrong",
  "what assumptions are being made",
  "why does this matter",
  "who could validate this",
  "who could validate the research",
  "what evidence is missing",
  "what follow-up research would you like",
  "what follow-up research would you want",
];

// Specific questions cite findings, sources, and stakeholders; generic ones
// are short. A floor keeps obviously-generic prompts out even when they
// don't match the prohibited list verbatim.
const MIN_PROMPT_CHARS = 80;

function normalizePrompt(p: string): string {
  return p
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isProhibitedGeneric(prompt: string): boolean {
  const n = normalizePrompt(prompt);
  return PROHIBITED_GENERIC.some((g) => n === g || n === `${g}?`.replace(/[^a-z0-9\s-]/g, ""));
}

export interface ParsedQuestions {
  questions: PacketQuestion[];
  /** Questions dropped during validation, with reasons (flagged, not fatal). */
  rejected: Array<{ position: number | null; reason: string }>;
}

/**
 * Validate questions.json. Individual bad questions are rejected with a
 * reason (the packet still persists — the owner can add questions in
 * review); a malformed document throws.
 */
export function parsePacketQuestions(raw: string): ParsedQuestions {
  let doc: any;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error("questions.json is not valid JSON");
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.questions)) {
    throw new Error("questions.json must be an object with a questions array");
  }

  const rejected: ParsedQuestions["rejected"] = [];
  const valid: PacketQuestion[] = [];
  for (const q of doc.questions) {
    const position = typeof q?.position === "number" ? q.position : null;
    const reject = (reason: string) => rejected.push({ position, reason });
    if (!q || typeof q !== "object") {
      reject("not an object");
      continue;
    }
    if (!QUESTION_FUNCTIONS.includes(q.function)) {
      reject(`unknown function: ${String(q.function)}`);
      continue;
    }
    if (typeof q.prompt !== "string" || q.prompt.trim() === "") {
      reject("prompt missing");
      continue;
    }
    // Generic check before the length floor: a prohibited worksheet prompt
    // is also short, and "generic" is the reason the owner needs to see.
    if (isProhibitedGeneric(q.prompt)) {
      reject("prompt matches a prohibited generic pattern");
      continue;
    }
    if (q.prompt.trim().length < MIN_PROMPT_CHARS) {
      reject("prompt too short to be research-specific");
      continue;
    }
    if (typeof q.claim_ref !== "string" || q.claim_ref.trim() === "") {
      reject("claim_ref missing — every question must cite an analysis element");
      continue;
    }
    valid.push({
      position: position ?? valid.length + 1,
      function: q.function,
      claim_ref: q.claim_ref.trim(),
      prompt: q.prompt.trim(),
      guidance: typeof q.guidance === "string" && q.guidance.trim() ? q.guidance.trim() : null,
      response_space: RESPONSE_SPACES.includes(q.response_space) ? q.response_space : "lines_5",
    });
  }

  // Normalize print order: sort by declared position, renumber 1..n, and
  // keep the required followup question last.
  valid.sort((a, b) => a.position - b.position);
  const followups = valid.filter((q) => q.function === "followup");
  const rest = valid.filter((q) => q.function !== "followup");
  // At most one followup section; extras are folded out (flagged).
  for (const extra of followups.slice(1)) {
    rejected.push({ position: extra.position, reason: "more than one followup question" });
  }
  const ordered = [...rest, ...followups.slice(0, 1)];
  ordered.forEach((q, i) => (q.position = i + 1));

  return { questions: ordered, rejected };
}

/** Light structural validation of analysis.json; returns the parsed object. */
export function parsePacketAnalysis(raw: string): Record<string, unknown> {
  let doc: any;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error("analysis.json is not valid JSON");
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("analysis.json must be a JSON object");
  }
  if (!Array.isArray(doc.claims) || doc.claims.length === 0) {
    throw new Error("analysis.json must record at least one claim");
  }
  return doc as Record<string, unknown>;
}

function fileFromResult(result: any, name: string): string | null {
  if (!result || !Array.isArray(result.channels)) return null;
  for (const ch of result.channels) {
    if (!Array.isArray(ch?.files)) continue;
    for (const f of ch.files) {
      if (f?.name === name && typeof f.content === "string") return f.content;
    }
  }
  return null;
}

/**
 * Persist the packet row + question rows for a completed packet run.
 * Idempotent; safe under webhook/reconciler races; never overwrites rows
 * that already exist (the owner may have edited them).
 */
export async function persistPacketResult(
  admin: any,
  run: { id: string; user_id: string; piece_id: string | null; input?: any },
  result: any,
): Promise<void> {
  if (!run.piece_id) throw new Error("packet run has no piece");

  // Revised packets (Phase 5) carry their version + provenance in the run
  // input, set at chain time by completeResearchAndChain.
  const packetMeta =
    run.input?.packet && typeof run.input.packet === "object"
      ? (run.input.packet as { version?: number; supersedes_packet_id?: string })
      : null;
  const version =
    typeof packetMeta?.version === "number" && packetMeta.version > 1 ? packetMeta.version : 1;
  const supersedes =
    typeof packetMeta?.supersedes_packet_id === "string" ? packetMeta.supersedes_packet_id : null;

  const analysisRaw = fileFromResult(result, "analysis.json");
  const questionsRaw = fileFromResult(result, "questions.json");

  let analysis: Record<string, unknown> | null = null;
  let parsed: ParsedQuestions = { questions: [], rejected: [] };
  const problems: string[] = [];
  if (analysisRaw) {
    try {
      analysis = parsePacketAnalysis(analysisRaw);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  } else {
    problems.push("analysis.json missing from run result");
  }
  if (questionsRaw) {
    try {
      parsed = parsePacketQuestions(questionsRaw);
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err));
    }
  } else {
    problems.push("questions.json missing from run result");
  }

  // Upsert the packet (unique on run_id). ignoreDuplicates: the first writer
  // wins; a redelivery or race never resets status/analysis.
  const { error: packetErr } = await admin.from("packets").upsert(
    {
      piece_id: run.piece_id,
      run_id: run.id,
      user_id: run.user_id,
      version,
      supersedes_packet_id: supersedes,
      status: "generated",
      analysis,
    },
    { onConflict: "run_id", ignoreDuplicates: true },
  );
  if (packetErr) throw new Error(`packet upsert failed: ${packetErr.message}`);

  // A revised packet closes out the follow-up loop on the packet it
  // supersedes (idempotent: repeated updates write the same values).
  if (supersedes) {
    await admin
      .from("packets")
      .update({ followup_state: "researched", updated_at: new Date().toISOString() })
      .eq("id", supersedes);
    await admin
      .from("followup_questions")
      .update({ status: "researched", updated_at: new Date().toISOString() })
      .eq("packet_id", supersedes)
      .eq("status", "approved");
  }

  const { data: packet, error: readErr } = await admin
    .from("packets")
    .select("id")
    .eq("run_id", run.id)
    .maybeSingle();
  if (readErr || !packet) {
    throw new Error(`packet row not readable after upsert: ${readErr?.message ?? "missing"}`);
  }

  if (parsed.questions.length > 0) {
    const rows = parsed.questions.map((q) => ({
      packet_id: packet.id,
      user_id: run.user_id,
      position: q.position,
      function: q.function,
      claim_ref: q.claim_ref,
      prompt: q.prompt,
      guidance: q.guidance,
      response_space: q.response_space,
      source: "generated",
    }));
    // ignoreDuplicates on (packet_id, position): re-entry inserts nothing and
    // never clobbers owner edits made in the review screen.
    const { error: qErr } = await admin
      .from("packet_questions")
      .upsert(rows, { onConflict: "packet_id,position", ignoreDuplicates: true });
    if (qErr) throw new Error(`packet questions upsert failed: ${qErr.message}`);
  }

  // Flag validation problems in the run's audit trail (transparency, not
  // failure — the owner can repair questions in review).
  if (problems.length > 0 || parsed.rejected.length > 0) {
    await admin.from("agent_run_events").insert({
      run_id: run.id,
      source: "edge",
      event_type: "packet_validation",
      payload: { problems, rejected: parsed.rejected, persisted: parsed.questions.length },
    });
  }
}
