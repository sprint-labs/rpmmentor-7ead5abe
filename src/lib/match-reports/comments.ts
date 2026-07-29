/**
 * Structured Match Report comments.
 *
 * A report has exactly ONE Comments textarea. Its content is loosely
 * structured by three editable section labels:
 *
 *   Summary:
 *   Key Moments:
 *   Development Focus:
 *
 * The labels are plain text the mentor can edit; nothing here rewrites or
 * reformats what a user typed. `ensureSections` only ever ADDS a missing
 * label — it never removes, reorders or reflows existing text, so historical
 * comments read back from the sheet are left exactly as they are.
 */

export const COMMENT_SECTIONS = ["Summary", "Key Moments", "Development Focus"] as const;
export type CommentSection = (typeof COMMENT_SECTIONS)[number];

/** Exactly what a brand-new blank report starts with. */
export const BLANK_COMMENTS_TEMPLATE = "Summary:\n\nKey Moments:\n\nDevelopment Focus:\n";

export const SECTION_HELP: Record<CommentSection, string> = {
  Summary: "Overall performance, workload and confidence.",
  "Key Moments": "Saves, distribution, goals conceded, incidents, minutes played.",
  "Development Focus": "One specific action to work on before the next match.",
};

/** Minimum meaningful (non-whitespace, non-heading) characters required. */
export const MIN_MEANINGFUL_CHARS = 40;

const HEADING_RE = /^[ \t]*(summary|key moments|development focus)[ \t]*:/i;

function canonicalLabel(raw: string): CommentSection | null {
  const s = raw.trim().toLowerCase();
  if (s === "summary") return "Summary";
  if (s === "key moments") return "Key Moments";
  if (s === "development focus") return "Development Focus";
  return null;
}

/** Which section labels are present in the text, in the order they appear. */
export function presentSections(text: string): CommentSection[] {
  const found: CommentSection[] = [];
  for (const line of (text ?? "").split("\n")) {
    const m = line.match(HEADING_RE);
    if (!m) continue;
    const label = canonicalLabel(m[1]);
    if (label && !found.includes(label)) found.push(label);
  }
  return found;
}

export function missingSections(text: string): CommentSection[] {
  const present = presentSections(text);
  return COMMENT_SECTIONS.filter((s) => !present.includes(s));
}

/**
 * Guarantee all three labels exist without losing any meaningful text.
 *
 * - Empty input -> the blank template.
 * - Text with no labels at all -> kept verbatim under `Summary:`.
 * - Text with some labels -> the missing ones are appended at the end in
 *   canonical order. Development Focus is therefore always present.
 */
export function ensureSections(text: string): string {
  const raw = text ?? "";
  if (!raw.trim()) return BLANK_COMMENTS_TEMPLATE;

  const missing = missingSections(raw);
  if (missing.length === 0) return raw;

  const present = presentSections(raw);
  let out = raw;

  if (present.length === 0) {
    // Nothing structured yet — keep the user's text verbatim under Summary.
    out = `Summary:\n${raw.replace(/^\n+/, "")}`;
  }

  for (const label of COMMENT_SECTIONS) {
    if (presentSections(out).includes(label)) continue;
    out = `${out.replace(/\s*$/, "")}\n\n${label}:\n`;
  }
  return out;
}

/** The user's actual prose: heading lines removed, everything else intact. */
export function meaningfulText(text: string): string {
  return (text ?? "")
    .split("\n")
    .map((line) => (HEADING_RE.test(line) ? line.replace(HEADING_RE, "") : line))
    .join("\n");
}

/** Count of meaningful characters, excluding whitespace and the headings. */
export function meaningfulCharCount(text: string): number {
  return meaningfulText(text).replace(/\s+/g, "").length;
}

function normaliseParagraph(p: string): string {
  return p.trim().replace(/\s+/g, " ").toLowerCase();
}

const SCORE_ONLY_RE =
  /^(?:[1-5](?:\.\d)?|[1-5]\s*\/\s*5|one|two|three|four|five)$/i;

const PLACEHOLDER_RE =
  /^(?:test(?:ing)?(?:\s*\d+)?|tbc|tba|n\/?a|none|nil|null|xx+|asdf+|qwerty|placeholder|todo|lorem(?:\s+ipsum)?|same as (?:above|last)|no comment|ok|fine|good|bad)$/i;

/** Split prose into comparable fragments (sentences / list items / lines). */
function fragments(body: string): string[] {
  return body
    .split(/[\n,;.!?]+/)
    .map(normaliseParagraph)
    .filter(Boolean);
}

export type CommentValidation = { ok: true } | { ok: false; message: string };

/**
 * Deterministic-only validation. No AI, no subjective judgement about
 * football language — we block empty/short input, score-only values,
 * obvious placeholder/testing strings, and plainly repeated text.
 */
export function validateComments(text: string): CommentValidation {
  const body = meaningfulText(text ?? "");
  const compact = body.replace(/\s+/g, " ").trim();

  if (!compact) {
    return {
      ok: false,
      message: "Add match notes under Summary, Key Moments and Development Focus before submitting.",
    };
  }

  if (SCORE_ONLY_RE.test(compact)) {
    return { ok: false, message: "Comments can't be just a score — describe what you saw." };
  }

  const frags = fragments(body);

  // Placeholder / test-only content, including the classic "testing, testing"
  // (and any case/whitespace variation of it).
  if (frags.length > 0 && frags.every((f) => PLACEHOLDER_RE.test(f))) {
    return { ok: false, message: "Placeholder or test text isn't accepted — add real match notes." };
  }

  // A repeated deterministic TEST/PLACEHOLDER phrase such as "testing, testing"
  // (any case/whitespace variation). Legitimate repeated football terminology
  // ("save, save") is NOT rejected here.
  if (frags.length >= 2 && new Set(frags).size === 1 && PLACEHOLDER_RE.test(frags[0])) {
    return {
      ok: false,
      message: "Comments repeat the same test phrase — add real match detail.",
    };
  }


  // ANY duplicated paragraph (A / B / A) is rejected, not just all-identical.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map(normaliseParagraph)
    .filter(Boolean);

  if (paragraphs.length >= 2 && new Set(paragraphs).size < paragraphs.length) {
    return { ok: false, message: "Comments repeat the same text — add distinct notes for each section." };
  }

  if (meaningfulCharCount(text) < MIN_MEANINGFUL_CHARS) {
    return {
      ok: false,
      message: `Comments need at least ${MIN_MEANINGFUL_CHARS} characters of match detail (headings don't count).`,
    };
  }

  return { ok: true };
}


// ---------------------------------------------------------------------------
// Transcript / OCR insertion — never replaces the user's comments.
// ---------------------------------------------------------------------------

/** Action keywords that make a transcript read as a moment rather than an overview. */
const KEY_MOMENT_RE =
  /\b(save[ds]?|saved|block(?:ed|s)?|punch(?:ed|es)?|claim(?:ed|s)?|cross(?:es|ed)?|distribut\w*|pass(?:es|ed|ing)?|kick(?:ed|s|ing)?|goal(?:s)?|concede[ds]?|penalt\w*|corner|free[- ]?kick|one[- ]?on[- ]?one|1v1|minute[s]?|\b\d{1,3}'\s|injur\w*|card|foul)\b/i;

/** Wording that reads as a general overview rather than a specific incident. */
const GENERAL_OVERVIEW_RE =
  /\b(overall|in general|generally|throughout|on the whole|performance|confiden\w*|calm|composed|assured|presence|communicat\w*|body language|mentality|attitude|workload|energy|solid|steady|dominant|positive|encouraging|looked\s+\w+|felt\s+\w+)\b/i;

export type InsertTarget = CommentSection;

/**
 * Placement of a transcript:
 * - `section` when the classification (or an explicit Development Focus caret)
 *   is confident.
 * - `cursor` when the classification is uncertain and the mentor has a caret.
 */
export type InsertPlacement =
  | { kind: "section"; section: CommentSection }
  | { kind: "cursor"; offset: number };

/** True when the transcript matches neither the action nor the overview cue. */
export function isUncertainTranscript(transcript: string): boolean {
  const t = transcript ?? "";
  return !KEY_MOMENT_RE.test(t) && !GENERAL_OVERVIEW_RE.test(t);
}

/** Pick the section a transcript should land in (section-only callers). */
export function chooseInsertSection(
  transcript: string,
  cursorSection: CommentSection | null,
): InsertTarget {
  // A cursor explicitly placed in Development Focus is always respected;
  // Development Focus is never chosen automatically otherwise.
  if (cursorSection === "Development Focus") return "Development Focus";
  if (KEY_MOMENT_RE.test(transcript)) return "Key Moments";
  if (GENERAL_OVERVIEW_RE.test(transcript)) return "Summary";
  if (cursorSection) return cursorSection;
  // Uncertain with no caret at all — append under Key Moments.
  return "Key Moments";
}

/**
 * Exact placement rules:
 *   action incidents            -> Key Moments
 *   clearly general overview    -> Summary
 *   caret in Development Focus  -> Development Focus (never automatic)
 *   uncertain + caret available -> insert at the caret
 *   uncertain + no caret        -> append under Key Moments
 */
export function resolveInsertPlacement(
  transcript: string,
  cursorSection: CommentSection | null,
  caret: number | null,
): InsertPlacement {
  if (cursorSection === "Development Focus") {
    return { kind: "section", section: "Development Focus" };
  }
  if (KEY_MOMENT_RE.test(transcript)) return { kind: "section", section: "Key Moments" };
  if (GENERAL_OVERVIEW_RE.test(transcript)) return { kind: "section", section: "Summary" };
  if (caret != null && caret >= 0) return { kind: "cursor", offset: caret };
  return { kind: "section", section: "Key Moments" };
}


/** Which section a caret offset sits in (null when not inside any section). */
export function sectionAtOffset(text: string, offset: number): CommentSection | null {
  if (offset == null || offset < 0) return null;
  let pos = 0;
  let current: CommentSection | null = null;
  for (const line of (text ?? "").split("\n")) {
    const lineEnd = pos + line.length;
    const m = line.match(HEADING_RE);
    if (m) {
      const label = canonicalLabel(m[1]);
      if (label) {
        if (offset <= lineEnd) return current;
        current = label;
      }
    }
    if (offset <= lineEnd) return current;
    pos = lineEnd + 1;
  }
  return current;
}

export type InsertResult = { text: string; selectionStart: number; selectionEnd: number };

/**
 * Insert `snippet` into `text` under the chosen section, appending to that
 * section's existing content. Returns the new text plus the caret offset at
 * the end of the inserted snippet so the caller can restore selection.
 */
export function insertUnderSection(
  text: string,
  snippet: string,
  section: CommentSection,
): InsertResult {
  const base = ensureSections(text);
  const trimmed = snippet.trim();
  if (!trimmed) return { text: base, selectionStart: base.length, selectionEnd: base.length };

  const lines = base.split("\n");
  let sectionLine = -1;
  let nextHeadingLine = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (!m) continue;
    const label = canonicalLabel(m[1]);
    if (label === section && sectionLine === -1) {
      sectionLine = i;
    } else if (sectionLine !== -1) {
      nextHeadingLine = i;
      break;
    }
  }
  if (sectionLine === -1) {
    const appended = `${base.replace(/\s*$/, "")}\n\n${trimmed}\n`;
    return { text: appended, selectionStart: appended.length, selectionEnd: appended.length };
  }

  // End of the section = last non-empty line before the next heading.
  let end = nextHeadingLine - 1;
  while (end > sectionLine && lines[end].trim() === "") end -= 1;

  const before = lines.slice(0, end + 1);
  const after = lines.slice(end + 1);
  const hasContent = before.slice(sectionLine + 1).some((l) => l.trim() !== "");
  const insertLines = hasContent ? ["", trimmed] : [trimmed];

  const merged = [...before, ...insertLines, ...after].join("\n");
  const caret =
    before.join("\n").length + 1 + insertLines.join("\n").length;
  return { text: merged, selectionStart: caret, selectionEnd: caret };
}

/**
 * Insert `snippet` at an exact caret offset, preserving all existing text and
 * returning the caret position at the end of the inserted snippet.
 */
export function insertAtOffset(
  text: string,
  snippet: string,
  offset: number,
): InsertResult {
  const base = ensureSections(text);
  const trimmed = snippet.trim();
  if (!trimmed) return { text: base, selectionStart: offset, selectionEnd: offset };
  const at = Math.max(0, Math.min(offset, base.length));
  const before = base.slice(0, at);
  const after = base.slice(at);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const tail = after && !/^\s/.test(after) ? " " : "";
  const insert = `${lead}${trimmed}${tail}`;
  const merged = `${before}${insert}${after}`;
  const caret = at + lead.length + trimmed.length;
  return { text: merged, selectionStart: caret, selectionEnd: caret };
}
