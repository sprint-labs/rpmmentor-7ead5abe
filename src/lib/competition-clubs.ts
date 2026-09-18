/**
 * Which clubs play in which competition, learned from Mentor Hub's own data.
 *
 * The Submit Report form needs to offer "Championship clubs" when a mentor
 * picks the Championship. There is no league-table feed here, and a hardcoded
 * list of 24 clubs goes stale every summer, so the index is derived from two
 * things the app already holds and that stay current on their own:
 *
 *   1. The goalkeeper roster — a player's `league` places their `current_club`
 *      (and `parent_club`, for loans) in that competition.
 *   2. Past match reports — a report's `competition` places both its `team` and
 *      its `opponent` in that competition.
 *
 * Every fixture a mentor files therefore teaches the index one or two more
 * clubs. Suggestions are never a closed list: the form stays free text, so a
 * club RPM has not met yet is typed once and known from then on.
 */

export interface ClubIndexPlayer {
  league: string;
  current_club: string;
  parent_club?: string | null;
}

export interface ClubIndexReport {
  competition?: string | null;
  team?: string | null;
  opponent?: string | null;
}

export interface ClubIndexSource {
  players?: readonly ClubIndexPlayer[];
  reports?: readonly ClubIndexReport[];
}

export interface CompetitionClubIndex {
  /** Every competition seen, display-cased, alphabetical. */
  competitions: string[];
  /** Lookup key (see `competitionKey`) → clubs in that competition. */
  clubsByCompetition: Record<string, string[]>;
  /** Every club seen anywhere, for cups and unknown competitions. */
  allClubs: string[];
}

export const EMPTY_CLUB_INDEX: CompetitionClubIndex = {
  competitions: [],
  clubsByCompetition: {},
  allClubs: [],
};

/**
 * Lookup key for a competition name. Case and spacing vary between the roster,
 * the Sheet-era reports and what a mentor types, so "EFL  Championship" and
 * "efl championship" have to land on the same bucket.
 */
export function competitionKey(competition: string | null | undefined): string {
  return (competition ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Case-insensitive de-dupe that keeps the first spelling it saw. */
function addName(into: Map<string, string>, raw: string | null | undefined): void {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return;
  const key = name.toLowerCase();
  if (!into.has(key)) into.set(key, name);
}

function sortedValues(map: Map<string, string>): string[] {
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Build the competition → clubs index from whatever data the caller has.
 * Both sources are optional: with neither, the result is simply empty and the
 * form falls back to plain free text.
 */
export function buildCompetitionClubIndex(source: ClubIndexSource): CompetitionClubIndex {
  const competitions = new Map<string, string>();
  const clubs = new Map<string, Map<string, string>>();
  const allClubs = new Map<string, string>();

  const place = (competition: string | null | undefined, club: string | null | undefined) => {
    addName(allClubs, club);
    const key = competitionKey(competition);
    if (!key) return;
    addName(competitions, competition);
    let bucket = clubs.get(key);
    if (!bucket) {
      bucket = new Map<string, string>();
      clubs.set(key, bucket);
    }
    addName(bucket, club);
  };

  for (const player of source.players ?? []) {
    place(player.league, player.current_club);
    place(player.league, player.parent_club);
  }

  for (const report of source.reports ?? []) {
    place(report.competition, report.team);
    place(report.competition, report.opponent);
  }

  const clubsByCompetition: Record<string, string[]> = {};
  for (const [key, bucket] of clubs) clubsByCompetition[key] = sortedValues(bucket);

  return {
    competitions: sortedValues(competitions),
    clubsByCompetition,
    allClubs: sortedValues(allClubs),
  };
}

/**
 * Clubs to offer for a competition.
 *
 * An unrecognised or empty competition falls back to every club known, which is
 * the right answer for cups and for the moment before a competition is picked —
 * an Ipswich keeper can meet anyone in the FA Cup.
 */
export function clubsForCompetition(
  index: CompetitionClubIndex,
  competition: string | null | undefined,
): string[] {
  const key = competitionKey(competition);
  const known = key ? index.clubsByCompetition[key] : undefined;
  return known && known.length > 0 ? known : index.allClubs;
}

/** True when the competition has its own club list, rather than the fallback. */
export function hasClubsForCompetition(
  index: CompetitionClubIndex,
  competition: string | null | undefined,
): boolean {
  const key = competitionKey(competition);
  return Boolean(key && (index.clubsByCompetition[key]?.length ?? 0) > 0);
}
