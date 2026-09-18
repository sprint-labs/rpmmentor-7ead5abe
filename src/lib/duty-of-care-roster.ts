/**
 * Duty-of-care status for a whole roster list, from the live database view.
 *
 * The goalkeeper list used to compute this on the client from the illustrative
 * seed interactions in `mock-data`. A keeper with real logged contact therefore
 * read "Not enough data" in the list while his own profile — which has always
 * read `public.player_duty_of_care` — said "Overdue". The two disagreed because
 * they were answering from different data, not because the maths differed.
 *
 * Nothing here recalculates a status. `duty_of_care_at()` remains the only
 * place that decides; this indexes its rows by goalkeeper name so a list can
 * look each one up, and reports honestly when the answer is not available yet.
 */
import { normaliseGoalkeeperName } from "@/lib/goalkeeper-filters";
import { dutyLevelFromState } from "@/lib/duty-of-care-status";
import type { PlayerDutyOfCareRow } from "@/lib/duty-of-care.functions";
import { DUTY_LABELS, type DutyLevel } from "@/lib/mock-data";

export interface RosterDutyStatus {
  level: DutyLevel;
  label: string;
}

export type RosterDutyIndex = Map<string, RosterDutyStatus>;

/** Index the view's rows by normalised goalkeeper name. */
export function buildRosterDutyIndex(rows: readonly PlayerDutyOfCareRow[]): RosterDutyIndex {
  const index: RosterDutyIndex = new Map();
  // Defensive: the roster is a whole page, and a malformed response should cost
  // one column rather than the screen.
  if (!Array.isArray(rows)) return index;
  for (const row of rows) {
    const name = normaliseGoalkeeperName(row.full_name ?? "");
    if (!name) continue;
    const level = dutyLevelFromState(row.state);
    index.set(name, { level, label: row.status_label?.trim() || DUTY_LABELS[level] });
  }
  return index;
}

export interface RosterDutyQueryState {
  pending?: boolean;
  error?: boolean;
}

/**
 * The status to show for one goalkeeper.
 *
 * While the read is in flight, or if it failed, the list says so rather than
 * claiming "Not enough data" — a missing answer and a known-empty one are
 * different things, and only one of them is the mentor's problem to fix.
 */
export function rosterDutyFor(
  index: RosterDutyIndex,
  goalkeeperName: string,
  state: RosterDutyQueryState = {},
): RosterDutyStatus {
  if (state.error) return { level: "not_enough_data", label: "Unavailable" };
  const found = index.get(normaliseGoalkeeperName(goalkeeperName));
  if (found) return found;
  if (state.pending) return { level: "not_enough_data", label: "Loading…" };
  return { level: "not_enough_data", label: DUTY_LABELS.not_enough_data };
}

/** How many goalkeepers sit at each level, for the filter chips. */
export function countRosterDuty(
  index: RosterDutyIndex,
  goalkeeperNames: readonly string[],
  state: RosterDutyQueryState = {},
): Record<DutyLevel, number> & { total: number } {
  const counts = {
    total: goalkeeperNames.length,
    up_to_date: 0,
    due_soon: 0,
    overdue: 0,
    not_required: 0,
    not_enough_data: 0,
  };
  for (const name of goalkeeperNames) counts[rosterDutyFor(index, name, state).level] += 1;
  return counts;
}
