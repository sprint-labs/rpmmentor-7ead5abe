import { getGk } from "@/lib/mock-data";
import { legacyGkSlugForName } from "@/lib/goalkeeper-player-link";
import type { MediaAsset, MediaKind } from "@/lib/media-store";

/**
 * How a goalkeeper is labelled on a shelf: the roster name, plus the club the
 * shelf header prints beside it.
 */
export interface GoalkeeperInfo {
  name: string;
  club: string | null;
}

/**
 * One goalkeeper, plus every `media_assets.gk_id` their media may be filed
 * under.
 *
 * `gk_id` has never held one value per goalkeeper. The column comment set by
 * `20260820122905_allow_unlinked_media_assets.sql` says so outright: "New
 * explicit links use canonical `public.players.id`; historical rows may
 * contain legacy `gk-*` slugs." Both kinds are live, and the profile page has
 * always resolved the slug form through `rosterRowForLegacySlug`.
 *
 * Grouping on the raw value therefore split one goalkeeper across two shelves
 * — both titled with their name, because `resolveGoalkeeper` falls back to the
 * legacy roster and happily names the slug bucket too. The library counted
 * them as two goalkeepers, and "View all" fetched only whichever id the shelf
 * happened to carry, silently hiding the other half of their footage.
 *
 * Collapsing on `canonicalId` fixes the split; carrying `aliases` is what lets
 * a filter fetch all of it.
 */
export interface GoalkeeperIdentity extends GoalkeeperInfo {
  /** `players.id` — the one id every alias collapses to. */
  canonicalId: string;
  /** Every id this goalkeeper's media may be stored under, canonical first. */
  aliases: string[];
}

/** The roster rows this module needs; a structural subset of `PlayerRosterRow`. */
export interface RosterPlayerLike {
  id: string;
  full_name: string;
  current_club?: string | null;
}

/**
 * Index the roster by every id a goalkeeper's media could carry.
 *
 * Both the canonical UUID and the legacy slug map to the same identity object,
 * so a lookup by either answers with the same goalkeeper.
 */
export function buildGoalkeeperIdentities(
  players: readonly RosterPlayerLike[],
): Map<string, GoalkeeperIdentity> {
  const byAnyId = new Map<string, GoalkeeperIdentity>();
  for (const player of players) {
    const slug = legacyGkSlugForName(player.full_name);
    const aliases = slug && slug !== player.id ? [player.id, slug] : [player.id];
    const identity: GoalkeeperIdentity = {
      canonicalId: player.id,
      name: player.full_name,
      club: player.current_club || null,
      aliases,
    };
    for (const alias of aliases) byAnyId.set(alias, identity);
  }
  return byAnyId;
}

/** Every id this `gk_id` may also be filed under, including itself. */
export function aliasesForGkId(
  gkId: string,
  roster: ReadonlyMap<string, GoalkeeperInfo>,
): string[] {
  const identity = roster.get(gkId);
  return isIdentity(identity) ? identity.aliases : [gkId];
}

/** The id a `gk_id` collapses to, or itself when the roster does not know it. */
export function canonicalGkId(gkId: string, roster: ReadonlyMap<string, GoalkeeperInfo>): string {
  const identity = roster.get(gkId);
  return isIdentity(identity) ? identity.canonicalId : gkId;
}

function isIdentity(info: GoalkeeperInfo | undefined): info is GoalkeeperIdentity {
  return Boolean(info && "canonicalId" in info);
}

export interface MediaShelf {
  key: string;
  title: string;
  /** Club for a goalkeeper shelf, the "no goalkeeper on record" note for Unlinked. */
  subtitle: string | null;
  /** Set on a goalkeeper shelf so "View all" can filter straight to them. */
  gkId: string | null;
  /**
   * Every id this shelf's goalkeeper may be filed under. "View all" filters on
   * all of them, so a goalkeeper holding both a canonical and a legacy-slug
   * link does not lose half their media on the way to the flat grid.
   */
  gkIds: string[];
  unlinked: boolean;
  items: MediaAsset[];
  /**
   * False on the goalkeeper and Unlinked shelves, whose heading already says
   * whose media this is — the tile would only repeat it.
   */
  showsGoalkeeperOnTile: boolean;
}

/** The newest slice pinned to the top shelf. Everything is still on a shelf below. */
export const RECENT_SHELF_LIMIT = 12;

/**
 * Roster first, then the legacy mock roster for a `gk_id` that predates the
 * players table, then a placeholder — the same order the flat grid used.
 */
export function resolveGoalkeeper(
  gkId: string,
  roster: ReadonlyMap<string, GoalkeeperInfo>,
): GoalkeeperInfo {
  const known = roster.get(gkId);
  if (known) return known;
  const legacy = getGk(gkId);
  return { name: legacy?.name ?? "Unknown goalkeeper", club: legacy?.club ?? null };
}

/**
 * Group an already-filtered, newest-first asset list into shelves: Recently
 * added, then one per goalkeeper in alphabetical order, then Unlinked.
 *
 * Assets keep the order they arrive in, so each shelf stays newest-first.
 */
export function buildMediaShelves(
  assets: readonly MediaAsset[],
  roster: ReadonlyMap<string, GoalkeeperInfo>,
): MediaShelf[] {
  if (assets.length === 0) return [];

  const shelves: MediaShelf[] = [
    {
      key: "recently-added",
      title: "Recently added",
      subtitle: null,
      gkId: null,
      gkIds: [],
      unlinked: false,
      items: assets.slice(0, RECENT_SHELF_LIMIT),
      showsGoalkeeperOnTile: true,
    },
  ];

  const byGoalkeeper = new Map<string, MediaAsset[]>();
  const unlinked: MediaAsset[] = [];
  for (const asset of assets) {
    if (!asset.gk_id) {
      unlinked.push(asset);
      continue;
    }
    // Collapse the canonical UUID and the legacy `gk-*` slug onto one key, so
    // a goalkeeper linked both ways gets one shelf rather than two.
    const key = canonicalGkId(asset.gk_id, roster);
    const bucket = byGoalkeeper.get(key);
    if (bucket) bucket.push(asset);
    else byGoalkeeper.set(key, [asset]);
  }

  const goalkeeperShelves = Array.from(byGoalkeeper, ([gkId, items]): MediaShelf => {
    const info = resolveGoalkeeper(gkId, roster);
    return {
      key: `goalkeeper-${gkId}`,
      title: info.name,
      subtitle: info.club,
      gkId,
      gkIds: aliasesForGkId(gkId, roster),
      unlinked: false,
      items,
      showsGoalkeeperOnTile: false,
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  shelves.push(...goalkeeperShelves);

  if (unlinked.length > 0) {
    shelves.push({
      key: "unlinked",
      title: "Unlinked",
      subtitle: "no goalkeeper on record",
      gkId: null,
      gkIds: [],
      unlinked: true,
      items: unlinked,
      showsGoalkeeperOnTile: false,
    });
  }

  return shelves;
}

export type MediaKindCounts = Record<MediaKind | "all", number>;

/** Per-type counts for the toolbar's segmented control. */
export function countMediaKinds(assets: readonly MediaAsset[]): MediaKindCounts {
  const counts: MediaKindCounts = {
    all: assets.length,
    video: 0,
    audio: 0,
    pdf: 0,
    image: 0,
  };
  for (const asset of assets) {
    if (asset.media_type in counts) counts[asset.media_type] += 1;
  }
  return counts;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The unfiltered page subtitle: how much is here and how it is shelved.
 *
 * Counts goalkeepers, not distinct `gk_id` values — one goalkeeper linked by
 * both their UUID and their legacy slug is one goalkeeper, and used to be
 * counted as two.
 */
export function describeLibrary(
  assets: readonly MediaAsset[],
  roster: ReadonlyMap<string, GoalkeeperInfo> = new Map(),
): string {
  const goalkeepers = new Set<string>();
  let unlinked = 0;
  for (const asset of assets) {
    if (asset.gk_id) goalkeepers.add(canonicalGkId(asset.gk_id, roster));
    else unlinked += 1;
  }
  const parts = [plural(assets.length, "asset"), plural(goalkeepers.size, "goalkeeper")];
  if (unlinked > 0) parts.push(`${unlinked} unlinked`);
  return parts.join(" · ");
}
