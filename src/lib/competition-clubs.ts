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

import { COMPETITIONS } from "@/lib/competitions";

/** Canonical spellings, indexed by their lowercase form. */
const CANONICAL_BY_LOWER = new Map<string, string>(
  COMPETITIONS.map((name) => [name.toLowerCase(), name]),
);

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
 * Short forms that mean an existing competition.
 *
 * Years of reports were typed by hand into a spreadsheet, so the same
 * competition arrives spelled several ways — "championship" next to "EFL
 * Championship", "League Cup" next to "Carabao Cup". Left alone they are
 * separate entries in the picker, each holding half the clubs.
 *
 * Only unambiguous aliases belong here. "Premiership" is deliberately absent:
 * in this roster it could be the SPFL or the Premier League, and folding it
 * onto the wrong one is worse than leaving two entries visible.
 */
const COMPETITION_ALIASES: Record<string, string> = {
  championship: "EFL Championship",
  "the championship": "EFL Championship",
  "sky bet championship": "EFL Championship",
  "league one": "EFL League One",
  "league 1": "EFL League One",
  "sky bet league one": "EFL League One",
  "league two": "EFL League Two",
  "league 2": "EFL League Two",
  "sky bet league two": "EFL League Two",
  "efl cup": "Carabao Cup",
  "league cup": "Carabao Cup",
  "the fa cup": "FA Cup",
  "papa john's trophy": "EFL Trophy",
  "vertu trophy": "EFL Trophy",
  "bristol street motors trophy": "EFL Trophy",
  epl: "Premier League",
  "english premier league": "Premier League",
};

/** Trimmed, whitespace-collapsed. The shared first step of both keys below. */
function tidy(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/**
 * The spelling a competition should be shown and stored under.
 *
 * An alias resolves to its canonical name; anything else that matches a name in
 * `COMPETITIONS`, ignoring case, takes that list's spelling, so "efl league one"
 * from an old report displays as "EFL League One". A competition nobody has
 * catalogued is left exactly as typed.
 */
export function canonicalCompetition(competition: string | null | undefined): string {
  const name = tidy(competition);
  if (!name) return "";
  const lower = name.toLowerCase();
  const alias = COMPETITION_ALIASES[lower];
  if (alias) return alias;
  const known = CANONICAL_BY_LOWER.get(lower);
  return known ?? name;
}

/**
 * Lookup key for a competition. Case, spacing and the short forms above all
 * collapse onto one key, so "championship" and "EFL Championship" share a
 * bucket instead of splitting its clubs between them.
 */
export function competitionKey(competition: string | null | undefined): string {
  return canonicalCompetition(competition).toLowerCase();
}

/**
 * Lookup key for a club. Clubs get case and spacing folded but never the
 * competition aliases — those are about competitions and have no business
 * rewriting a club's name.
 */
export function clubKey(club: string | null | undefined): string {
  return tidy(club).toLowerCase();
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

  const place = (rawCompetition: string | null | undefined, club: string | null | undefined) => {
    addName(allClubs, club);
    // Store the canonical spelling, so one competition is one entry however it
    // was typed into the report it came from.
    const competition = canonicalCompetition(rawCompetition);
    const key = competitionKey(competition);
    if (!key) return;
    addName(competitions, competition);
    let bucket = clubs.get(key);
    if (!bucket) {
      bucket = new Map<string, string>();
      clubs.set(key, bucket);
    }
    addName(bucket, club);

    const forClub = clubKey(club);
    if (!forClub) return;
    let owned = byClub.get(forClub);
    if (!owned) {
      owned = new Map<string, string>();
      byClub.set(forClub, owned);
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
  const key = clubKey(club);
  const known = key ? index.competitionsByClub[key] : undefined;
  return known && known.length > 0 ? known : index.competitions;
}

/** True when the club has its own competition list, rather than the fallback. */
export function hasCompetitionsForClub(
  index: CompetitionClubIndex,
  club: string | null | undefined,
): boolean {
  const key = clubKey(club);
  return Boolean(key && (index.competitionsByClub[key]?.length ?? 0) > 0);
}
