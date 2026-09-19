/**
 * Which goalkeeper a `/goalkeepers/$gkId` URL means.
 *
 * The roster now lists `public.players`, so a slug can name someone the seed
 * array has never heard of — anyone added since it was captured. Resolving
 * against the seed alone answered "no such goalkeeper" for a row the roster had
 * just shown, so the live table is consulted first and the seed contributes
 * only what no column exists for.
 *
 * Kept out of the route so it can be tested directly: the invariant that
 * matters — every slug the roster can produce resolves to a profile — is a
 * property of this function, not of the page.
 */
import { goalkeepers, type Goalkeeper } from "@/lib/mock-data";
import {
  findPlayerByName,
  legacyGkSlugForName,
  normalisePersonName,
} from "@/lib/goalkeeper-player-link";
import type { PlayerRosterRow } from "@/lib/players.functions";
import { toGoalkeeper } from "@/lib/roster/live-goalkeepers";

export interface ResolvedGoalkeeperProfile {
  /** The goalkeeper to render, or null when the slug names nobody. */
  gk: Goalkeeper | null;
  /** The live roster row, when the slug matches one. */
  livePlayer: PlayerRosterRow | null;
  /** The seed row, when the slug matches one. */
  seedGk: Goalkeeper | null;
}

/**
 * The narrative fields the database has no column for.
 *
 * Everything else — name, club, league, tier, Academy, Free Agent, contract —
 * comes from the live row, so this page cannot contradict the roster row that
 * was clicked to reach it.
 */
function withSeedNarrative(live: Goalkeeper, seed: Goalkeeper | null): Goalkeeper {
  if (!seed) return live;
  return {
    ...live,
    bio: seed.bio,
    developmentPlan: seed.developmentPlan,
    videoLinks: seed.videoLinks,
  };
}

export function resolveGoalkeeperProfile(
  players: readonly PlayerRosterRow[] | null | undefined,
  slug: string,
  seed: readonly Goalkeeper[] = goalkeepers,
): ResolvedGoalkeeperProfile {
  const seedGk = seed.find((g) => g.id === slug) ?? null;
  const livePlayer =
    (players ?? []).find((row) => legacyGkSlugForName(row.full_name) === slug) ?? null;

  return {
    gk: livePlayer ? withSeedNarrative(toGoalkeeper(livePlayer), seedGk) : seedGk,
    livePlayer,
    seedGk,
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
