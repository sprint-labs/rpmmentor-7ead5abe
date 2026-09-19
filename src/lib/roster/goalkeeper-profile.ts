/**
 * The two things the live roster cannot answer on its own.
 *
 * `public.players` is the source of truth for who is on the roster and for
 * every column it holds. Two gaps remain, and both are here:
 *
 *  - **A goalkeeper's narrative** — biography, development plan, highlight-reel
 *    links — has no column, so `toGoalkeeper` cannot carry it. A profile built
 *    from the database alone silently blanks all three.
 *
 *  - **A name typed or picked on a form** has to resolve against the same live
 *    roster the form offered, or it rejects goalkeepers it had just listed.
 *
 * Kept out of the routes so both are testable directly.
 */
import { goalkeepers, type Goalkeeper } from "@/lib/mock-data";
import { findPlayerByName, normalisePersonName } from "@/lib/goalkeeper-player-link";
import type { PlayerRosterRow } from "@/lib/players.functions";
import { toGoalkeeper } from "@/lib/roster/live-goalkeepers";

/** Seed rows by normalised name, built once from the roster already in memory. */
const SEED_BY_NAME = new Map(goalkeepers.map((gk) => [normalisePersonName(gk.name), gk] as const));

/**
 * The narrative fields the database has no column for.
 *
 * Everything else — name, club, league, tier, Academy, Free Agent, contract —
 * comes from the live row, so a profile cannot contradict the roster row that
 * was clicked to reach it. A goalkeeper signed since the seed was captured
 * simply has no narrative yet, which is honest: nobody has written one.
 */
export function withSeedNarrative(
  live: Goalkeeper,
  seed: ReadonlyMap<string, Goalkeeper> = SEED_BY_NAME,
): Goalkeeper {
  const match = seed.get(normalisePersonName(live.name));
  if (!match) return live;
  return {
    ...live,
    bio: match.bio,
    developmentPlan: match.developmentPlan,
    videoLinks: match.videoLinks,
  };
}

/**
 * The goalkeeper a name picked on a form, a calendar event or a match report
 * means.
 *
 * Those surfaces offer — or are filled from — the live roster, so they must
 * resolve against it too. Matching only the seed dropped goalkeepers the same
 * surface had just offered: anyone signed since the seed was captured lost
 * their profile link, their tier badge and, on the Match Report form, the
 * ability to attach a voice note at all.
 *
 * The seed is kept as a fallback only because a picker can still fall back to
 * it while the roster query is in flight.
 */
export function goalkeeperByName(
  name: string,
  players: readonly PlayerRosterRow[] | null | undefined,
  seed: readonly Goalkeeper[] = goalkeepers,
): Goalkeeper | null {
  const live = findPlayerByName(players, name);
  if (live) return toGoalkeeper(live);

  const key = normalisePersonName(name);
  if (!key) return null;
  return seed.find((g) => normalisePersonName(g.name) === key) ?? null;
}
