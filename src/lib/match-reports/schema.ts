import { z } from "zod";

/**
 * Match Report schema — locked field list from the RPM Match Reports sheet.
 * Column order matches "GKHQ Propietry Data Hub" (A..O) exactly.
 * If the sheet is ever restructured, only `sheetHeader` needs to change;
 * `columnId` is stable and used throughout the app.
 */
export const PILLAR_IDS = [
  "protect_goal",
  "protect_space",
  "protect_air",
  "control_play",
  "change_play",
  "psych",
  "physical",
] as const;
export type PillarId = (typeof PILLAR_IDS)[number];

export const PILLAR_LABELS: Record<PillarId, string> = {
  protect_goal: "Protect the Goal",
  protect_space: "Protect the Space",
  protect_air: "Protect the Air",
  control_play: "Control the Play",
  change_play: "Change the Play",
  psych: "Courage / Control / Intelligent / Competitor",
  physical: "Speed, Agility and Athleticism",
};

/** Sheet tab that holds the reports. */
export const SHEET_TAB = "GKHQ Propietry Data Hub";
export const SHEET_ID = "1UHesbMdPt89d_oZ86iIppQqkFQyWWwuIxklFEjfdywU";

/**
 * Column layout of the sheet (A..O). Index into a row array.
 *
 * A..N are the historical columns and MUST never be reordered or retyped.
 * O (Competition) is the approved app-owned column; historical rows leave it
 * blank. The sheet layout is A:O only — nothing writes to P or beyond.
 */
export const COLUMN_INDEX = {
  goalkeeper: 0,
  coach: 1,
  team: 2,
  opponent: 3,
  match_date: 4,
  protect_goal: 5,
  protect_space: 6,
  protect_air: 7,
  control_play: 8,
  change_play: 9,
  psych: 10,
  physical: 11,
  average: 12,
  comments: 13,
  competition: 14,
} as const;

export const SHEET_HEADERS = [
  "Goalkeeper",
  "Coach",
  "Team",
  "Opponent",
  "Match Date",
  "Protect the Goal",
  "Protect the Space",
  "Protect the Air",
  "Control the Play",
  "Change the Play",
  "Courage / Control / Intelligent / Competitor",
  "Speed, Agility, Athleticism",
  "Av Score",
  "Comments",
  "Competition",
];

// NOTE: a "Source" provenance column is deliberately DEFERRED pending an
// Excel audit. Do not add a Source sheet column, field or stamped value.



export const pillarScore = z
  .number({ message: "Score is required" })
  .int()
  .min(1, "Min 1")
  .max(5, "Max 5");

/** Full payload accepted by the submit server fn. */
export const matchReportSubmitSchema = z.object({
  goalkeeper: z.string().trim().min(1, "Goalkeeper is required").max(80),
  // Coach is derived server-side from the authenticated profile on every real
  // write. The client value is display-only, so a missing/stale name must not
  // fail schema validation before the server derivation runs.
  coach: z.string().trim().max(80).optional().default(""),
  team: z.string().trim().min(1, "Team is required").max(80),
  opponent: z.string().trim().min(1, "Opponent is required").max(80),
  competition: z.string().trim().max(120).optional().default(""),
  match_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((d) => new Date(d).getTime() <= Date.now(), "Match date can't be in the future"),
  protect_goal: pillarScore,
  protect_space: pillarScore,
  protect_air: pillarScore,
  control_play: pillarScore,
  change_play: pillarScore,
  psych: pillarScore,
  physical: pillarScore,
  comments: z.string().max(5000).optional().default(""),
});

export type MatchReportSubmit = z.infer<typeof matchReportSubmitSchema>;

/** Server-side row shape returned to the UI (already normalised). */
export interface MatchReportRow {
  /** Unique, team-aware identity (with an occurrence suffix when needed). */
  report_id: string;
  /** Pre-Team identity — kept so historic detail URLs still resolve. */
  legacy_report_id: string;
  row_index: number | null;
  goalkeeper: string;
  coach: string;
  team: string | null;
  opponent: string | null;
  competition: string | null;
  match_date: string | null; // YYYY-MM-DD
  scores: Record<PillarId, number | null>;
  average: number | null;
  comments: string;
}

/** Small non-cryptographic stable hash. */
function stableHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * LEGACY identity (Goalkeeper + Match Date + Opponent). It excludes Team, so
 * two clubs' fixtures can collide. Retained ONLY so historic detail URLs and
 * cache rows keep resolving — never used as the primary identity for new work.
 */
export function computeReportId(input: {
  goalkeeper: string;
  match_date: string | null;
  opponent: string | null;
}): string {
  const s = `${input.goalkeeper.trim().toLowerCase()}|${input.match_date ?? ""}|${(input.opponent ?? "").trim().toLowerCase()}`;
  return `mr_${stableHash(s)}`;
}

/**
 * Current identity: Goalkeeper + Team + Opponent + Match Date. Same inputs
 * always produce the same base id; genuinely confirmed duplicates are
 * separated by an occurrence suffix assigned in `parseSheetRows`.
 */
export function computeReportUid(input: {
  goalkeeper: string;
  team: string | null;
  opponent: string | null;
  match_date: string | null;
}): string {
  const norm = (v: string | null | undefined) =>
    (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const s = [
    norm(input.goalkeeper),
    norm(input.team),
    norm(input.opponent),
    (input.match_date ?? "").trim(),
  ].join("|");
  return `mr2_${stableHash(s)}`;
}

/** Strip an occurrence suffix ("mr2_abc~2" -> "mr2_abc"). */
export function baseReportUid(id: string): string {
  const i = id.indexOf("~");
  return i === -1 ? id : id.slice(0, i);
}

/**
 * Parse all sheet rows into reports with unique identities.
 * Rows sharing a base uid (an explicitly confirmed duplicate) get `~2`, `~3`…
 * in sheet order, so list/detail/cache/delete never collapse them.
 */
export function parseSheetRows(rows: string[][], firstDataRow: number): MatchReportRow[] {
  const seen = new Map<string, number>();
  const out: MatchReportRow[] = [];
  rows.forEach((row, i) => {
    const r = rowToMatchReport(row, firstDataRow + i);
    if (!r) return;
    const base = r.report_id;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    if (n > 1) r.report_id = `${base}~${n}`;
    out.push(r);
  });
  return out;
}

/**
 * The exact identity of the row at `rowIndex` (1-based sheet row), including
 * any `~2`/`~3` occurrence suffix given to an explicitly confirmed duplicate.
 * Returns null when the row can't be located — callers must then report an
 * ambiguous outcome rather than a clean success.
 */
export function identityForRowIndex(
  reports: MatchReportRow[],
  rowIndex: number,
): MatchReportRow | null {
  if (!Number.isFinite(rowIndex) || rowIndex <= 0) return null;
  return reports.find((r) => r.row_index === rowIndex) ?? null;
}

/** True when `id` addresses this report by current OR legacy identity. */
export function matchesReportId(r: MatchReportRow, id: string): boolean {
  return (
    r.report_id === id ||
    baseReportUid(r.report_id) === id ||
    r.legacy_report_id === id
  );
}

export function averageOfScores(v: Pick<MatchReportSubmit,
  "protect_goal" | "protect_space" | "protect_air" | "control_play" | "change_play" | "psych" | "physical"
>): number {
  const scores = PILLAR_IDS.map((id) => v[id]);
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

/** Parse mixed date strings from the sheet (10/10/2025 or 2025-10-10). */
export function parseSheetDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(s)) return s;
  // dd/mm/yyyy or d/m/yyyy — the sheet locale is en_GB, so day comes first.
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // dd-mm-yyyy / dd.mm.yyyy written as text.
  const m2 = s.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{4})$/);
  if (m2) {
    const [, d, mo, y] = m2;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Only fall back to Date.parse for unambiguous, non-numeric formats
  // (e.g. "10 Oct 2025"). Numeric slashed dates are never handed to
  // Date.parse, which would read them as US month/day.
  if (/[a-z]/i.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return null;
}

/** Format YYYY-MM-DD -> dd/mm/yyyy for the sheet's existing convention. */
export function formatSheetDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

/** Turn a raw row array from the sheet into a MatchReportRow. */
export function rowToMatchReport(row: string[], rowIndex: number): MatchReportRow | null {
  const goalkeeper = (row[COLUMN_INDEX.goalkeeper] ?? "").trim();
  if (!goalkeeper) return null;
  const match_date = parseSheetDate(row[COLUMN_INDEX.match_date]);
  const opponent = (row[COLUMN_INDEX.opponent] ?? "").trim() || null;
  const num = (i: number) => {
    const v = row[i];
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    report_id: computeReportUid({ goalkeeper, team: (row[COLUMN_INDEX.team] ?? "").trim() || null, opponent, match_date }),
    legacy_report_id: computeReportId({ goalkeeper, match_date, opponent }),
    row_index: rowIndex,
    goalkeeper,
    coach: (row[COLUMN_INDEX.coach] ?? "").trim(),
    team: (row[COLUMN_INDEX.team] ?? "").trim() || null,
    opponent,
    competition: (row[COLUMN_INDEX.competition] ?? "").toString().trim() || null,
    
    match_date,
    scores: {
      protect_goal: num(COLUMN_INDEX.protect_goal),
      protect_space: num(COLUMN_INDEX.protect_space),
      protect_air: num(COLUMN_INDEX.protect_air),
      control_play: num(COLUMN_INDEX.control_play),
      change_play: num(COLUMN_INDEX.change_play),
      psych: num(COLUMN_INDEX.psych),
      physical: num(COLUMN_INDEX.physical),
    },
    average: num(COLUMN_INDEX.average),
    comments: (row[COLUMN_INDEX.comments] ?? "").toString(),
  };
}
