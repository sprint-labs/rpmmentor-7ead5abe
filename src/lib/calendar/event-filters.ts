/**
 * Narrowing the calendar by what someone is actually looking for.
 *
 * Goalkeeper is a field on the event. Team and competition are not: a fixture
 * imported from the feed has both folded into its title, as
 * `"{club} v {opponent} ({competition})"`. So team is matched against the
 * title with the competition taken off the end — otherwise typing a team name
 * that happens to appear in a competition would match every fixture in it —
 * and competition against that trailing bracket alone.
 *
 * Every field is a plain "contains", case- and accent-insensitive, so the list
 * narrows on each keystroke rather than waiting for a whole name.
 */

/** Case- and accent-insensitive, so "Jose" finds "José". */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The competition an imported fixture carries in the brackets on its title. */
export function competitionFromTitle(title: string): string {
  const match = /\(([^()]*)\)\s*$/.exec(title.trim());
  return match ? match[1].trim() : "";
}

/** The title with that trailing competition removed. */
export function teamsFromTitle(title: string): string {
  return title.trim().replace(/\s*\([^()]*\)\s*$/, "");
}

export interface EventFilters {
  goalkeeper?: string;
  team?: string;
  competition?: string;
}

export function hasActiveEventFilters(filters: EventFilters): boolean {
  return Boolean(filters.goalkeeper?.trim() || filters.team?.trim() || filters.competition?.trim());
}

export function matchesEventFilters(
  event: { title: string; goalkeeperName?: string | null; gkName?: string | null },
  filters: EventFilters,
): boolean {
  const goalkeeper = fold(filters.goalkeeper ?? "");
  const team = fold(filters.team ?? "");
  const competition = fold(filters.competition ?? "");

  // Calendar rows store the player as `gkName`; other callers use `goalkeeperName`.
  if (goalkeeper && !fold(event.goalkeeperName ?? event.gkName ?? "").includes(goalkeeper))
    return false;
  if (team && !fold(teamsFromTitle(event.title)).includes(team)) return false;
  if (competition && !fold(competitionFromTitle(event.title)).includes(competition)) return false;

  return true;
}
