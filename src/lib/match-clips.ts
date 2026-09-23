import { findPlayerByName } from "@/lib/goalkeeper-player-link";
import type { MediaAsset } from "@/lib/media-store";

/**
 * Match Clips are `media_assets` rows classified `match_clip` on upload,
 * anchored to the calendar Match they are footage of. The match — its date,
 * title and goalkeeper — is read from `calendar_events`, never copied onto the
 * clip, so the two can never disagree.
 */

/** The calendar columns this module reads; a structural subset of `TeamCalendarEvent`. */
export interface MatchEventLike {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  status: string;
  player_id: string | null;
  goalkeeper_name: string | null;
}

export interface RosterPlayerLike {
  id: string;
  full_name: string;
}

/** Days after a match that its date still defaults into the upload picker. */
export const RECENT_MATCH_WINDOW_DAYS = 14;

export function isPickableMatch(event: MatchEventLike): boolean {
  return event.event_type === "Match" && event.status !== "cancelled";
}

/**
 * Matches that can have footage: played or playing today, not cancelled,
 * newest first. A fixture in the future has nothing to clip yet.
 */
export function pickableMatches<T extends MatchEventLike>(
  events: readonly T[],
  today: string,
): T[] {
  return events
    .filter((event) => isPickableMatch(event) && event.event_date <= today)
    .sort((a, b) => b.event_date.localeCompare(a.event_date) || a.title.localeCompare(b.title));
}

/** YYYY-MM-DD `days` before `today`, calendar arithmetic only (no timezone drift). */
export function shiftDateOnly(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! - days));
  return date.toISOString().slice(0, 10);
}

export function isRecentMatch(event: MatchEventLike, today: string): boolean {
  return event.event_date >= shiftDateOnly(today, RECENT_MATCH_WINDOW_DAYS);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * "Sat 19 Sep 2026". `event_date` is a calendar date, so it is read in UTC and
 * spelled out by hand: ICU versions disagree on "Sep"/"Sept" and on a comma
 * after the weekday, and the label has to read the same in every browser.
 */
export function formatMatchDate(eventDate: string): string {
  const date = new Date(`${eventDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return eventDate;
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Sat 19 Sep 2026 · Brighton v Fulham (U21 PL) · James Beadle" */
export function matchLabel(event: MatchEventLike): string {
  const parts = [formatMatchDate(event.event_date), event.title.trim() || "Match"];
  const goalkeeper = event.goalkeeper_name?.trim();
  if (goalkeeper && !event.title.includes(goalkeeper)) parts.push(goalkeeper);
  return parts.join(" · ");
}

/**
 * The canonical `players.id` a clip for this match belongs to.
 *
 * Imported fixtures carry `player_id`; older hand-made events may carry only a
 * name, which is resolved against the roster the same way the rest of the app
 * links names to players.
 */
export function goalkeeperIdForMatch(
  event: MatchEventLike | null | undefined,
  players: readonly RosterPlayerLike[],
): string | null {
  if (!event) return null;
  if (event.player_id) return event.player_id;
  if (!event.goalkeeper_name) return null;
  return findPlayerByName(players, event.goalkeeper_name)?.id ?? null;
}

/**
 * Resolve where one queued file goes: its own override when it has one,
 * otherwise the batch's match. `undefined` means "no override"; an explicit
 * `null` override means "this file has no match".
 */
export function resolveClipMatch(
  batchMatchId: string | null,
  override: string | null | undefined,
): string | null {
  return override === undefined ? batchMatchId : override;
}

export interface MatchClipGroup<E extends MatchEventLike = MatchEventLike> {
  /** `match_event_id`, or `"unmatched"`. */
  key: string;
  /** Null for the Unmatched group, and for a match the reader cannot see. */
  event: E | null;
  clips: MediaAsset[];
}

export const UNMATCHED_GROUP_KEY = "unmatched";

/**
 * One group per match, newest match first, Unmatched last.
 *
 * A clip whose `match_event_id` is not in `eventsById` (the fixture was
 * deleted after the read, or sits outside the loaded calendar window) still
 * gets its own group — footage is never hidden because its match is missing.
 */
export function groupClipsByMatch<E extends MatchEventLike>(
  clips: readonly MediaAsset[],
  eventsById: ReadonlyMap<string, E>,
): MatchClipGroup<E>[] {
  const groups = new Map<string, MatchClipGroup<E>>();
  for (const clip of clips) {
    const key = clip.match_event_id ?? UNMATCHED_GROUP_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        event: clip.match_event_id ? (eventsById.get(clip.match_event_id) ?? null) : null,
        clips: [],
      };
      groups.set(key, group);
    }
    group.clips.push(clip);
  }

  const newestClip = (group: MatchClipGroup<E>) =>
    group.clips.reduce((latest, clip) => (clip.created_at > latest ? clip.created_at : latest), "");

  return [...groups.values()].sort((a, b) => {
    if (a.key === UNMATCHED_GROUP_KEY) return 1;
    if (b.key === UNMATCHED_GROUP_KEY) return -1;
    const aDate = a.event?.event_date ?? "";
    const bDate = b.event?.event_date ?? "";
    return bDate.localeCompare(aDate) || newestClip(b).localeCompare(newestClip(a));
  });
}

/** Keep only groups whose match date falls inside [from, to] (inclusive, YYYY-MM-DD). */
export function filterGroupsByMatchDate<E extends MatchEventLike>(
  groups: readonly MatchClipGroup<E>[],
  from: string | undefined,
  to: string | undefined,
): MatchClipGroup<E>[] {
  if (!from && !to) return [...groups];
  return groups.filter((group) => {
    const date = group.event?.event_date;
    if (!date) return false;
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

export function describeMatchClips(groups: readonly MatchClipGroup[]): string {
  const clipCount = groups.reduce((sum, group) => sum + group.clips.length, 0);
  if (clipCount === 0) return "No match clips yet.";
  const matchCount = groups.filter((group) => group.key !== UNMATCHED_GROUP_KEY).length;
  const unmatched = groups.find((group) => group.key === UNMATCHED_GROUP_KEY)?.clips.length ?? 0;
  const parts = [
    `${clipCount} ${clipCount === 1 ? "clip" : "clips"}`,
    `${matchCount} ${matchCount === 1 ? "match" : "matches"}`,
  ];
  if (unmatched > 0) parts.push(`${unmatched} unmatched`);
  return parts.join(" · ");
}

/**
 * True when a read failed because the Match Clips columns are not in the
 * database yet. The page says so plainly instead of a generic error.
 */
export function isMissingMatchClipsSchema(message: string | null | undefined): boolean {
  if (!message) return false;
  return /asset_purpose|match_event_id|upload_batch_id/.test(message);
}

/** The Monday-first week (7 × `YYYY-MM-DD`) containing `dateIso`, in calendar terms. */
export function weekOf(dateIso: string): string[] {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(y!, m! - 1, d! - mondayOffset + i)).toISOString().slice(0, 10),
  );
}

/** Matches keyed by `event_date`, each day's list in title order. */
export function matchesByDate<E extends MatchEventLike>(matches: readonly E[]): Map<string, E[]> {
  const byDate = new Map<string, E[]>();
  for (const event of matches) {
    const list = byDate.get(event.event_date) ?? [];
    list.push(event);
    byDate.set(event.event_date, list);
  }
  for (const list of byDate.values()) list.sort((a, b) => a.title.localeCompare(b.title));
  return byDate;
}

/** "2026/27" — English football seasons run from July to June. */
export function seasonOf(dateIso: string): string {
  const [y, m] = dateIso.split("-").map(Number);
  const start = m! >= 7 ? y! : y! - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The searchable facts about a match, read from the calendar row (never the clip). */
export interface MatchFacts {
  /** Both sides, e.g. ["Reading", "Notts County"]. */
  teams: string[];
  /**
   * The fixture's competition: a league, domestic cup, European or
   * international competition, or a friendly. Null when the fixture does not
   * record one — never guessed from the goalkeeper's league, because a club
   * plays several competitions and a guess would file an FA Cup tie under its
   * league.
   */
  competition: string | null;
  season: string;
}

/** Shown, and offered as a filter, for a match whose competition is missing. */
export const COMPETITION_NOT_SET = "Competition not set";

function noteField(notes: string | null | undefined, field: string): string | null {
  const value = new RegExp(`^${field}:\\s*(.+)$`, "im").exec(notes ?? "")?.[1]?.trim();
  return value || null;
}

/**
 * Teams, competition and season for a match. Imported fixtures title
 * themselves "Home v Away (Competition)" and repeat Club, Opponent and
 * Competition in the notes.
 */
export function matchFacts(event: MatchEventLike & { notes?: string | null }): MatchFacts {
  const titleMatch = /^(.+?)\s+v\s+(.+?)(?:\s*\(([^)]+)\))?\s*$/i.exec(event.title.trim());
  const teams = [
    titleMatch?.[1],
    titleMatch?.[2],
    noteField(event.notes, "Club"),
    noteField(event.notes, "Opponent"),
  ]
    .map((team) => team?.trim())
    .filter((team): team is string => Boolean(team));
  const competition = noteField(event.notes, "Competition") ?? titleMatch?.[3]?.trim() ?? null;
  return {
    teams: [...new Map(teams.map((team) => [team.toLowerCase(), team])).values()],
    competition: competition || null,
    season: seasonOf(event.event_date),
  };
}

/** The competition as shown to people: never blank. */
export function competitionLabel(facts: MatchFacts): string {
  return facts.competition ?? COMPETITION_NOT_SET;
}

export interface MatchClipFilter {
  /** Free text: team, competition, goalkeeper, fixture or clip title. */
  query?: string;
  season?: string;
  competition?: string;
  team?: string;
}

/**
 * Narrow groups by season, competition, team and free text. The Unmatched
 * group has no match facts, so any match filter hides it; free text still
 * searches its clip titles.
 */
export function filterMatchClipGroups<E extends MatchEventLike>(
  groups: readonly MatchClipGroup<E>[],
  filter: MatchClipFilter,
  factsFor: (event: E) => MatchFacts,
  goalkeeperName: (gkId: string) => string | null,
): MatchClipGroup<E>[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return groups.filter((group) => {
    const facts = group.event ? factsFor(group.event) : null;
    if ((filter.season || filter.competition || filter.team) && !facts) return false;
    if (facts && filter.season && facts.season !== filter.season) return false;
    // "Competition not set" is a real option, so blank fixtures can be found and fixed.
    if (facts && filter.competition && !same(competitionLabel(facts), filter.competition))
      return false;
    if (facts && filter.team && !facts.teams.some((team) => same(team, filter.team!))) return false;
    if (!query) return true;
    const haystack = [
      group.event?.title,
      group.event?.goalkeeper_name,
      facts ? competitionLabel(facts) : null,
      ...(facts?.teams ?? []),
      ...group.clips.map((clip) => clip.title),
      ...group.clips.map((clip) => (clip.gk_id ? goalkeeperName(clip.gk_id) : null)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return query.split(/\s+/).every((word) => haystack.includes(word));
  });
}
