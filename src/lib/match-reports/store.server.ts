/**
 * Canonical Match Report store — Supabase.
 *
 * This module is the ONLY place that knows how a Match Report is persisted.
 * Google Sheets is no longer part of any runtime read or write path; it is a
 * dormant archive that the one-time backfill (`backfill.functions.ts`) imports
 * from, and nothing else.
 *
 * Server-only: every function takes a service-role client. Never import this
 * from a route or from `*.functions.ts` module scope — import it dynamically
 * inside a server-fn handler, the same way `sheets.server.ts` was imported.
 */
import { PILLAR_IDS, baseReportUid, type MatchReportRow, type PillarId } from "./schema";

/**
 * The canonical table. It kept the historical `_cache` name so this migration
 * stays additive — see the table comment in
 * `supabase/migrations/20260808040000_match_reports_canonical_store.sql`.
 */
export const CANONICAL_TABLE = "match_reports_cache";

export const CANONICAL_COLUMNS =
  "report_id,legacy_report_id,row_index,goalkeeper,coach,team,opponent,competition,match_date," +
  "protect_goal,protect_space,protect_air,control_play,change_play,psych,physical," +
  "average,comments,source,submitted_at,submitted_by,submission_key,synced_at,created_at,deleted_at";

/** Postgres unique-violation — another writer got there first. */
const UNIQUE_VIOLATION = "23505";

/**
 * The index that keeps one Match Report per scheduled event.
 *
 * A conflict on it is NOT the retryable kind: allocating another occurrence id
 * would not resolve it, because the clash is over the event rather than over the
 * fixture identity. It has to be reported instead of retried.
 */
const CALENDAR_EVENT_INDEX = "match_reports_cache_calendar_event_id_key";

function isCalendarEventConflict(error: { message?: string; details?: string } | null): boolean {
  const text = `${error?.message ?? ""} ${error?.details ?? ""}`;
  return text.includes(CALENDAR_EVENT_INDEX);
}

/** PostgREST caps a single response; page through so a large history is complete. */
const PAGE_SIZE = 1000;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Db = { from: (table: string) => any };

export interface CanonicalRow {
  report_id: string;
  legacy_report_id: string | null;
  row_index: number | null;
  goalkeeper: string;
  coach: string;
  team: string | null;
  opponent: string | null;
  competition: string | null;
  match_date: string | null;
  protect_goal: number | null;
  protect_space: number | null;
  protect_air: number | null;
  control_play: number | null;
  change_play: number | null;
  psych: number | null;
  physical: number | null;
  average: number | string | null;
  comments: string | null;
  source?: string | null;
  submitted_at?: string | null;
  deleted_at?: string | null;
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Database row → the shape every Match Report screen already consumes. */
export function toMatchReportRow(row: CanonicalRow): MatchReportRow {
  const scores = {} as Record<PillarId, number | null>;
  for (const id of PILLAR_IDS) scores[id] = toNumber(row[id]);
  return {
    report_id: row.report_id,
    legacy_report_id: row.legacy_report_id ?? "",
    // Legacy Google Sheet row number kept purely for traceability back to the
    // archive. Nothing addresses the Sheet by it at runtime any more.
    row_index: row.row_index ?? null,
    goalkeeper: row.goalkeeper,
    coach: row.coach ?? "",
    team: row.team ?? null,
    opponent: row.opponent ?? null,
    competition: row.competition ?? null,
    match_date: row.match_date ?? null,
    scores,
    average: toNumber(row.average),
    comments: row.comments ?? "",
  };
}

/** Newest first by match date, undated last — the order /reports has always used. */
export function sortNewestFirst(reports: MatchReportRow[]): MatchReportRow[] {
  return reports.sort((a, b) => {
    if (!a.match_date && !b.match_date) return 0;
    if (!a.match_date) return 1;
    if (!b.match_date) return -1;
    return a.match_date < b.match_date ? 1 : a.match_date > b.match_date ? -1 : 0;
  });
}

/**
 * Every live Match Report. Soft-deleted rows are excluded; this is the single
 * read used by /reports, the dashboards, goalkeeper profiles and insights.
 */
export async function listCanonicalReports(db: Db): Promise<MatchReportRow[]> {
  const out: MatchReportRow[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from(CANONICAL_TABLE)
      .select(CANONICAL_COLUMNS)
      .is("deleted_at", null)
      .order("match_date", { ascending: false, nullsFirst: false })
      .order("report_id", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not load match reports: ${error.message}`);
    const rows = (data ?? []) as CanonicalRow[];
    out.push(...rows.map(toMatchReportRow));
    if (rows.length < PAGE_SIZE) break;
  }
  return sortNewestFirst(out);
}

/**
 * One report by any identity it has ever had: the exact id (including a `~2`
 * occurrence suffix), its base id, or its pre-Team legacy id.
 */
export async function getCanonicalReport(db: Db, reportId: string): Promise<MatchReportRow | null> {
  const exact = await db
    .from(CANONICAL_TABLE)
    .select(CANONICAL_COLUMNS)
    .eq("report_id", reportId)
    .is("deleted_at", null)
    .maybeSingle();
  if (exact.error) throw new Error(`Could not load match report: ${exact.error.message}`);
  if (exact.data) return toMatchReportRow(exact.data as CanonicalRow);

  // Compatibility lookups for historic URLs: the base id of an occurrence, and
  // the pre-Team `mr_` identity.
  const base = baseReportUid(reportId);
  const byBase = await db
    .from(CANONICAL_TABLE)
    .select(CANONICAL_COLUMNS)
    .is("deleted_at", null)
    .like("report_id", `${base}%`)
    .order("report_id", { ascending: true });
  if (!byBase.error) {
    // `_` is a LIKE wildcard, so the prefix match is re-checked exactly here.
    const hit = ((byBase.data ?? []) as CanonicalRow[]).find((r) =>
      isOccurrenceOf(r.report_id, base),
    );
    if (hit) return toMatchReportRow(hit);
  }

  const byLegacy = await db
    .from(CANONICAL_TABLE)
    .select(CANONICAL_COLUMNS)
    .is("deleted_at", null)
    .eq("legacy_report_id", reportId)
    .order("report_id", { ascending: true })
    .limit(1);
  if (!byLegacy.error && (byLegacy.data ?? []).length) {
    return toMatchReportRow(byLegacy.data[0] as CanonicalRow);
  }
  return null;
}

export interface InsertCanonicalInput {
  /** Base identity from `computeReportUid` — an occurrence suffix may be added. */
  baseReportId: string;
  legacyReportId: string;
  goalkeeper: string;
  coach: string;
  team: string;
  opponent: string;
  competition: string;
  match_date: string;
  scores: Record<PillarId, number>;
  average: number;
  comments: string;
  submittedBy: string;
  submissionKey: string;
  /**
   * The scheduled Match event this report writes up, when it was submitted from
   * one. The event carries the canonical goalkeeper and mentor ids, so a report
   * reached through this link is provably about the right people without any name
   * matching.
   */
  calendarEventId?: string | null;
}

export type InsertCanonicalResult =
  { ok: true; report_id: string; created: boolean } | { ok: false; message: string };

/** True when `id` is the base identity itself or one of its ~2/~3 occurrences. */
function isOccurrenceOf(id: string, base: string): boolean {
  return id === base || id.startsWith(`${base}~`);
}

/**
 * Which occurrence ids are already taken for a base identity. Soft-deleted rows
 * still count: an id is never reused, so a tombstoned report can't be shadowed
 * by a new one wearing its identity.
 */
async function takenOccurrences(db: Db, base: string): Promise<Set<string>> {
  const { data, error } = await db
    .from(CANONICAL_TABLE)
    .select("report_id")
    .like("report_id", `${base}%`);
  if (error) throw new Error(`Could not check report identity: ${error.message}`);
  // `_` is a LIKE wildcard and report ids contain one, so the prefix match is
  // re-checked exactly rather than trusted.
  return new Set(
    ((data ?? []) as { report_id: string }[])
      .map((r) => r.report_id)
      .filter((id) => isOccurrenceOf(id, base)),
  );
}

function nextFreeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}~${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Too many duplicate reports for this fixture.");
}

/**
 * Write the canonical Match Report.
 *
 * A confirmed duplicate fixture gets the next `~2`/`~3` occurrence id, exactly
 * as the Sheet parser used to assign them — except these ids are stable and
 * never reindex when another report is removed.
 *
 * The unique index on `submission_key` is the hard guarantee that a retry of
 * the same submission can never produce a second report: a conflict on it
 * resolves to the row that already exists rather than inserting again.
 */
export async function insertCanonicalReport(
  db: Db,
  input: InsertCanonicalInput,
): Promise<InsertCanonicalResult> {
  const nowIso = new Date().toISOString();
  const base = input.baseReportId;

  for (let attempt = 0; attempt < 6; attempt++) {
    // A retry of the same submission key must resolve to the report it already
    // wrote — checked before every insert attempt, not just the first.
    const existing = await db
      .from(CANONICAL_TABLE)
      .select("report_id")
      .eq("submission_key", input.submissionKey)
      .maybeSingle();
    if (!existing.error && existing.data) {
      return {
        ok: true,
        report_id: (existing.data as { report_id: string }).report_id,
        created: false,
      };
    }

    let candidate: string;
    try {
      candidate = nextFreeId(base, await takenOccurrences(db, base));
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Could not allocate a report id.",
      };
    }

    const { data, error } = await db
      .from(CANONICAL_TABLE)
      .insert({
        report_id: candidate,
        legacy_report_id: input.legacyReportId,
        row_index: null,
        goalkeeper: input.goalkeeper,
        coach: input.coach,
        team: input.team,
        opponent: input.opponent,
        competition: input.competition,
        match_date: input.match_date,
        protect_goal: input.scores.protect_goal,
        protect_space: input.scores.protect_space,
        protect_air: input.scores.protect_air,
        control_play: input.scores.control_play,
        change_play: input.scores.change_play,
        psych: input.scores.psych,
        physical: input.scores.physical,
        average: input.average,
        comments: input.comments,
        source: "app",
        submitted_at: nowIso,
        submitted_by: input.submittedBy,
        submission_key: input.submissionKey,
        calendar_event_id: input.calendarEventId ?? null,
        synced_at: nowIso,
      })
      .select("report_id")
      .maybeSingle();

    if (!error && data) {
      return { ok: true, report_id: (data as { report_id: string }).report_id, created: true };
    }
    if (error && isCalendarEventConflict(error)) {
      return {
        ok: false,
        message: "that scheduled event already has a Match Report",
      };
    }
    if (error && error.code !== UNIQUE_VIOLATION) {
      return { ok: false, message: error.message };
    }
    // Unique violation: either another writer took this occurrence id, or the
    // same submission key landed concurrently. Both are resolved by looping.
  }
  return {
    ok: false,
    message: "Could not allocate a unique report id after repeated attempts.",
  };
}

export interface UpdateCanonicalReportInput {
  /** Exact, base, or legacy report identity — resolved before updating. */
  reportId: string;
  scores: Record<PillarId, number>;
  average: number;
  comments: string;
}

export type UpdateCanonicalReportResult =
  { updated: true; report: MatchReportRow } | { updated: false; report: null };

/**
 * Correct the editable content of a report without changing its provenance,
 * fixture identity, author, or submission key.
 */
export async function updateCanonicalReport(
  db: Db,
  input: UpdateCanonicalReportInput,
): Promise<UpdateCanonicalReportResult> {
  const found = await getCanonicalReport(db, input.reportId);
  if (!found) return { updated: false, report: null };

  const { data, error } = await db
    .from(CANONICAL_TABLE)
    .update({
      protect_goal: input.scores.protect_goal,
      protect_space: input.scores.protect_space,
      protect_air: input.scores.protect_air,
      control_play: input.scores.control_play,
      change_play: input.scores.change_play,
      psych: input.scores.psych,
      physical: input.scores.physical,
      average: input.average,
      comments: input.comments,
    })
    .eq("report_id", found.report_id)
    .is("deleted_at", null)
    .select(CANONICAL_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Could not update the report: ${error.message}`);
  if (!data) return { updated: false, report: null };
  return { updated: true, report: toMatchReportRow(data as CanonicalRow) };
}

/**
 * Tombstone a report. Nothing is destroyed: the row stays for audit and the
 * Google Sheet archive is left completely untouched.
 */
export async function softDeleteCanonicalReport(
  db: Db,
  reportId: string,
): Promise<{ deleted: boolean; report_id: string | null; row_index: number | null }> {
  const found = await getCanonicalReport(db, reportId);
  if (!found) return { deleted: false, report_id: null, row_index: null };
  const { error } = await db
    .from(CANONICAL_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("report_id", found.report_id)
    .is("deleted_at", null);
  if (error) throw new Error(`Could not delete the report: ${error.message}`);
  return { deleted: true, report_id: found.report_id, row_index: found.row_index };
}
