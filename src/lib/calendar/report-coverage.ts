/**
 * Which of the five tracked report types have been logged for a goalkeeper, and
 * therefore which are still missing.
 *
 * The calendar's MISSING badges used to answer this from `mentor-session-store`,
 * an in-memory mock that starts empty and is discarded on reload. Every
 * goalkeeper therefore looked as though nothing had ever been logged for them,
 * whatever the database actually held. Coverage now comes from the persisted
 * rows; this module is the pure half — given those rows, decide what is missing.
 *
 * The tracked types are the Match Report plus the four interaction types.
 */
import { INTERACTION_TYPES } from "@/lib/interactions/schema";
import { normalisePersonName } from "@/lib/goalkeeper-player-link";

/**
 * Shared so that every path which writes a report or an interaction can refresh
 * the badges without repeating the key as a literal.
 */
export const reportCoverageQueryKey = ["calendar", "report-coverage"] as const;

export const MATCH_REPORT_TYPE = "Match Report";

export type TrackedReportType = typeof MATCH_REPORT_TYPE | (typeof INTERACTION_TYPES)[number];

export const TRACKED_REPORT_TYPES: readonly TrackedReportType[] = [
  MATCH_REPORT_TYPE,
  ...INTERACTION_TYPES,
];

const SHORT_LABEL: Record<TrackedReportType, string> = {
  "Match Report": "MR",
  "Live Match Observation": "LMO",
  "Training Ground Visit": "TGV",
  "Coffee Catch Up": "CCU",
  "Phone Call": "PC",
};

export function shortLabel(t: TrackedReportType): string {
  return SHORT_LABEL[t];
}

export function isTrackedReportType(value: string): value is TrackedReportType {
  return (TRACKED_REPORT_TYPES as readonly string[]).includes(value);
}

/** One thing that has been logged: a Match Report or an interaction. */
export interface ReportCoverageEntry {
  type: TrackedReportType;
  /** Canonical roster id, where the source row carries one. */
  playerId: string | null;
  /** Legacy mock slug (`gk-james-beadle`) still held by older interactions. */
  gkSlug: string | null;
  goalkeeperName: string | null;
  /** Calendar date (`YYYY-MM-DD`) the report or interaction relates to. */
  occurredOn: string;
}

/** Whatever a calendar event knows about its goalkeeper. */
export interface GoalkeeperRef {
  playerId?: string | null;
  gkSlug?: string | null;
  name?: string | null;
}

export interface MissingWindow {
  /** The event's date, as a calendar date (`YYYY-MM-DD`). */
  referenceDate: string;
  /** Today, as a calendar date. Injected so this stays a pure function. */
  today: string;
  /** Window length in days. Defaults to 30. */
  windowDays?: number;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Dates are compared as calendar dates rather than instants: `event_date`,
 * `occurred_at` and `match_date` are all `DATE` columns, and converting them to
 * local times is what makes a report drift into the previous day.
 */
function shiftDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A window never extends into the future. Anchoring purely on the event date
 * would mean an event a month out looked back over dates that have not happened
 * yet, so everything would read as missing however recently it was logged.
 */
export function coverageWindow({ referenceDate, today, windowDays = 30 }: MissingWindow): {
  start: string;
  end: string;
} {
  const end = referenceDate < today ? referenceDate : today;
  return { start: shiftDays(end, -windowDays), end };
}

/**
 * Does this logged row concern this goalkeeper?
 *
 * Canonical ids decide it where both sides have one — two different player ids
 * are two different people, whatever the names look like. Otherwise fall back to
 * the legacy slug and then to the name, which Match Reports need: the canonical
 * store identifies a goalkeeper by name and holds no player id at all.
 */
function identifiesGoalkeeper(entry: ReportCoverageEntry, gk: GoalkeeperRef): boolean {
  if (gk.playerId && entry.playerId) return gk.playerId === entry.playerId;
  if (gk.gkSlug && entry.gkSlug) return gk.gkSlug === entry.gkSlug;
  const wanted = normalisePersonName(gk.name ?? "");
  return wanted !== "" && wanted === normalisePersonName(entry.goalkeeperName ?? "");
}

/**
 * The tracked report types with nothing logged for this goalkeeper inside the
 * window. An empty result means the goalkeeper is fully covered.
 */
export function missingReportTypes(
  coverage: readonly ReportCoverageEntry[],
  gk: GoalkeeperRef,
  window: MissingWindow,
): TrackedReportType[] {
  if (!gk.playerId && !gk.gkSlug && !normalisePersonName(gk.name ?? "")) {
    return [];
  }
  const { start, end } = coverageWindow(window);
  const logged = new Set<TrackedReportType>();
  for (const entry of coverage) {
    if (!DATE_ONLY.test(entry.occurredOn)) continue;
    if (entry.occurredOn < start || entry.occurredOn > end) continue;
    if (!identifiesGoalkeeper(entry, gk)) continue;
    logged.add(entry.type);
  }
  return TRACKED_REPORT_TYPES.filter((t) => !logged.has(t));
}
