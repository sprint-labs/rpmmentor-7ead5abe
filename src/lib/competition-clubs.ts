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
  /** The reverse: club key → the competitions that club has been seen in. */
  competitionsByClub: Record<string, string[]>;
  /** Every club seen anywhere, for cups and unknown competitions. */
  allClubs: string[];
}

export const EMPTY_CLUB_INDEX: CompetitionClubIndex = {
  competitions: [],
  clubsByCompetition: {},
  competitionsByClub: {},
  allClubs: [],
};

/**
 * Domestic cups a club is eligible for by virtue of its league.
 *
 * Unlike a league's membership, which changes every summer, this structure is
 * stable: a Championship club enters the FA Cup and the Carabao Cup whether or
 * not it has played one yet this season. Without it, a keeper's first cup tie of
 * the season would find no suggestion at all.
 */
const LEAGUE_CUPS: Record<string, readonly string[]> = {
  "premier league": ["FA Cup", "Carabao Cup"],
  "efl championship": ["FA Cup", "Carabao Cup"],
  "efl league one": ["FA Cup", "Carabao Cup", "EFL Trophy"],
  "efl league two": ["FA Cup", "Carabao Cup", "EFL Trophy"],
  "national league": ["FA Cup", "FA Trophy"],
  "national league north": ["FA Cup", "FA Trophy"],
  "national league south": ["FA Cup", "FA Trophy"],
  "spfl premiership": ["Scottish Cup", "Scottish League Cup"],
  "spfl championship": ["Scottish Cup", "Scottish League Cup"],
  "nifl premiership": ["Irish Cup", "NIFL League Cup"],
  "league of ireland premier division": ["FAI Cup"],
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
  const byClub = new Map<string, Map<string, string>>();
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

    const club_key = competitionKey(club);
    if (!club_key) return;
    let owned = byClub.get(club_key);
    if (!owned) {
      owned = new Map<string, string>();
      byClub.set(club_key, owned);
    }
    addName(owned, competition);
    // The league a club plays in also entitles it to its domestic cups.
    for (const cup of LEAGUE_CUPS[key] ?? []) addName(owned, cup);
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

  const competitionsByClub: Record<string, string[]> = {};
  for (const [key, bucket] of byClub) competitionsByClub[key] = sortedValues(bucket);

  return {
    competitions: sortedValues(competitions),
    clubsByCompetition,
    competitionsByClub,
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

/**
 * Competitions to offer once a club is known.
 *
 * Birmingham City play in the Championship, the FA Cup and the Carabao Cup.
 * They do not play in the Allsvenskan, and a mentor filing a Birmingham report
 * should not have to scroll past it. An unknown club — one typed by hand, or a
 * roster entry with no league — falls back to the full list rather than
 * offering nothing.
 */
export function competitionsForClub(
  index: CompetitionClubIndex,
  club: string | null | undefined,
): string[] {
  const key = competitionKey(club);
  const known = key ? index.competitionsByClub[key] : undefined;
  return known && known.length > 0 ? known : index.competitions;
}

/** True when the club has its own competition list, rather than the fallback. */
export function hasCompetitionsForClub(
  index: CompetitionClubIndex,
  club: string | null | undefined,
): boolean {
  const key = competitionKey(club);
  return Boolean(key && (index.competitionsByClub[key]?.length ?? 0) > 0);
}
