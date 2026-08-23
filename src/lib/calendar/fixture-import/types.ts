/**
 * Bulk fixture import types.
 *
 * Spreadsheet rows are interpreted into this shape before anything is written.
 * The live calendar table has no opponent/competition/home-away columns, so
 * those fields are carried through preview and then folded into title / notes /
 * location when building a `calendar_events` insert.
 */

export interface FixtureRosterPlayer {
  id: string;
  full_name: string;
  current_club?: string | null;
}

export interface ParsedFixtureRow {
  /** 1-based spreadsheet row number (header is usually row 1). */
  rowNumber: number;
  raw: Record<string, string>;
  dateRaw: string;
  timeRaw: string;
  goalkeeperRaw: string;
  clubRaw: string;
  opponentRaw: string;
  competitionRaw: string;
  venueRaw: string;
  homeAwayRaw: string;
}

export type GoalkeeperMatchStatus = "exact" | "ambiguous" | "unmatched" | "resolved";

export interface GoalkeeperMatchResult {
  status: GoalkeeperMatchStatus;
  /** Set when status is exact or resolved. */
  playerId: string | null;
  playerName: string | null;
  /** Candidates when ambiguous (or the empty list when unmatched). */
  candidates: FixtureRosterPlayer[];
  /** Original spreadsheet name that was matched. */
  sourceName: string;
}

export interface ExistingCalendarEventRef {
  id: string;
  player_id: string | null;
  event_date: string;
  start_time: string | null;
  title: string;
  event_type: string;
  notes: string;
  location: string | null;
  status?: string;
}

export type FixtureRowImportStatus =
  | "ready"
  | "duplicate"
  | "needs_goalkeeper"
  | "invalid";

export interface PreparedFixtureRow {
  rowNumber: number;
  parsed: ParsedFixtureRow;
  eventDate: string | null;
  startTime: string | null;
  homeAway: "H" | "A" | null;
  goalkeeper: GoalkeeperMatchResult;
  title: string;
  location: string | null;
  notes: string;
  /** Stable key used for idempotent duplicate detection. */
  duplicateKey: string;
  status: FixtureRowImportStatus;
  errors: string[];
  duplicateOfEventId: string | null;
}

export interface FixtureImportSummary {
  total: number;
  ready: number;
  duplicates: number;
  unmatchedGoalkeepers: number;
  ambiguousGoalkeepers: number;
  validationErrors: number;
}

export interface FixtureImportCommitRow {
  rowNumber: number;
  title: string;
  event_date: string;
  start_time: string;
  location: string | null;
  notes: string;
  player_id: string;
  assigned_mentor_id: string;
  duplicateKey: string;
}

export interface FixtureImportCommitResultRow {
  rowNumber: number;
  outcome: "imported" | "skipped_duplicate" | "failed";
  eventId: string | null;
  message: string;
}

export interface FixtureImportCommitResult {
  imported: number;
  skipped: number;
  failed: number;
  rows: FixtureImportCommitResultRow[];
}
