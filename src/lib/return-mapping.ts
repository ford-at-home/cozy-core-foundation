// Dictation segmentation for packet returns (Phase 2 of
// docs/research-workflow/04-return-and-recognition.md).
//
// The student dictates answers referencing locations the way the printed
// packet teaches: "Page 3, Question 2: …", "S4P3: tighten", "Follow-up
// question one: …". This module splits a transcript into segments and
// resolves each segment's reference target, following MARKUP.md's
// resolution order (block anchor → question number → page number). Pure
// module — tested in tests/return-mapping.test.ts.

export type DictationTarget = {
  page?: number;
  question?: number;
  anchor?: string;
  followup?: number;
};

export type DictationSegmentDraft = {
  transcript: string;
  target: DictationTarget | null;
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function parseNumber(raw: string): number | null {
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  const word = NUMBER_WORDS[raw.toLowerCase()];
  return word ?? null;
}

type RefMatch = {
  index: number;
  length: number;
  apply: (t: DictationTarget) => void;
};

const NUM = String.raw`(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;

// Order matters only for overlapping matches; each pattern names one kind
// of reference the printed packet teaches.
const REF_PATTERNS: Array<{
  re: RegExp;
  toApply: (m: RegExpExecArray) => ((t: DictationTarget) => void) | null;
}> = [
  {
    // "S4P3" spoken or typed, with optional spaces: "S4 P3", "s 4 p 3".
    re: /\bS\s*(\d{1,3})\s*P\s*(\d{1,3})\b/gi,
    toApply: (m) => {
      const anchor = `S${m[1]}P${m[2]}`;
      return (t) => (t.anchor = anchor);
    },
  },
  {
    re: new RegExp(String.raw`\bfollow[- ]?up question\s*(?:number\s*)?${NUM}\b`, "gi"),
    toApply: (m) => {
      const n = parseNumber(m[1]);
      return n ? (t) => (t.followup = n) : null;
    },
  },
  {
    re: new RegExp(String.raw`\b(?:question|q)\s*(?:number\s*)?${NUM}\b`, "gi"),
    toApply: (m) => {
      const n = parseNumber(m[1]);
      return n ? (t) => (t.question = n) : null;
    },
  },
  {
    re: new RegExp(String.raw`\bpage\s*(?:number\s*)?${NUM}\b`, "gi"),
    toApply: (m) => {
      const n = parseNumber(m[1]);
      return n ? (t) => (t.page = n) : null;
    },
  },
];

function findReferences(text: string): RefMatch[] {
  const found: RefMatch[] = [];
  for (const { re, toApply } of REF_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const apply = toApply(m);
      if (!apply) continue;
      // "follow-up question N" also matches the bare question pattern; skip
      // matches fully inside an earlier (longer) match.
      const overlaps = found.some(
        (f) => m!.index >= f.index && m!.index + m![0].length <= f.index + f.length,
      );
      if (overlaps) continue;
      found.push({ index: m.index, length: m[0].length, apply });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Whether the text between two references is pure connective filler. */
function isConnective(gap: string): boolean {
  return /^[\s,;:.–—-]*(?:and\s+|on\s+|of\s+|the\s+)*[\s,;:.–—-]*$/i.test(gap);
}

/**
 * Split a dictation transcript into segments, each carrying the reference
 * target stated at its start. Text before the first reference becomes an
 * untargeted segment (shown in verification for the student to place).
 */
export function segmentDictation(transcript: string): DictationSegmentDraft[] {
  const text = transcript.trim();
  if (!text) return [];
  const refs = findReferences(text);
  if (refs.length === 0) return [{ transcript: text, target: null }];

  // Group adjacent references joined only by connective filler
  // ("Page 3, question 2:" → one target with both fields).
  const groups: RefMatch[][] = [];
  for (const ref of refs) {
    const last = groups[groups.length - 1];
    if (last) {
      const prev = last[last.length - 1];
      const gap = text.slice(prev.index + prev.length, ref.index);
      if (isConnective(gap)) {
        last.push(ref);
        continue;
      }
    }
    groups.push([ref]);
  }

  const segments: DictationSegmentDraft[] = [];
  const preamble = text.slice(0, groups[0][0].index).trim();
  if (preamble.replace(/[\s,;:.–—-]+/g, "").length > 0) {
    segments.push({ transcript: preamble, target: null });
  }
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const start = group[0].index;
    const end = i + 1 < groups.length ? groups[i + 1][0].index : text.length;
    const target: DictationTarget = {};
    for (const ref of group) ref.apply(target);
    const segText = text
      .slice(start, end)
      .trim()
      .replace(/[\s,;]+$/, "");
    if (!segText) continue;
    segments.push({ transcript: segText, target });
  }
  return segments;
}

/** Compact human label for a segment's resolved target. */
export function describeTarget(target: DictationTarget | null): string {
  if (!target) return "Not placed yet";
  const parts: string[] = [];
  if (target.anchor) parts.push(target.anchor);
  if (target.followup) parts.push(`Follow-up question ${target.followup}`);
  else if (target.question) parts.push(`Question ${target.question}`);
  if (target.page) parts.push(`Page ${target.page}`);
  return parts.length > 0 ? parts.join(" · ") : "Not placed yet";
}
