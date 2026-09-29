/**
 * Which reports and interactions belong to a goalkeeper, and in what order.
 *
 * The profile page worked this out inline. The dossier route needs the same
 * answer from the same caches, and two copies of it would drift: a dossier that
 * ordered reports differently, or matched a name differently, would contradict
 * the profile it was opened from. So it lives here, pure and tested once.
 */
import type { Goalkeeper } from "@/lib/mock-data";
import { interactionBelongsToGoalkeeper, normalisePersonName } from "@/lib/goalkeeper-player-link";
import type { LoggedInteraction } from "@/lib/interactions/schema";
import type { MatchReportRow } from "@/lib/match-reports/schema";

/**
 * Newest match date first. An undated report sorts last rather than being
 * treated as the oldest or the newest — it has no date, not an early one.
 */
export function compareMatchDatesNewestFirst(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

/**
 * Reports on this goalkeeper, newest first.
 *
 * `normalisePersonName`, not a local lowercase: `gk.name` is `players.full_name`
 * and the two tables disagree about apostrophes — `Rich O'Donnell` is stored
 * straight on the roster, `Max O’Leary` curly on his reports. Matching any
 * other way silently loses a goalkeeper's whole history.
 */
export function reportsForGoalkeeper(
  reports: readonly MatchReportRow[] | null | undefined,
  goalkeeperName: string,
): MatchReportRow[] {
  const target = normalisePersonName(goalkeeperName);
  if (!target) return [];
  return (reports ?? [])
    .filter((r) => normalisePersonName(r.goalkeeper) === target)
    .sort((a, b) => compareMatchDatesNewestFirst(a.match_date, b.match_date));
}

/** Interactions logged against this goalkeeper, newest first. */
export function interactionsForGoalkeeper(
  interactions: readonly LoggedInteraction[] | null | undefined,
  gk: Goalkeeper,
  linkedPlayerId: string | null,
): LoggedInteraction[] {
  return (interactions ?? [])
    .filter((i) => interactionBelongsToGoalkeeper(i, gk, linkedPlayerId))
    .sort((a, b) => +new Date(b.occurredAt) - +new Date(a.occurredAt));
}
