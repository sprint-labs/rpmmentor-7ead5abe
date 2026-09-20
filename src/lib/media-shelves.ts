import { getGk } from "@/lib/mock-data";
import type { MediaAsset, MediaKind } from "@/lib/media-store";

/**
 * How a goalkeeper is labelled on a shelf: the roster name, plus the club the
 * shelf header prints beside it.
 */
export interface GoalkeeperInfo {
  name: string;
  club: string | null;
}

export interface MediaShelf {
  key: string;
  title: string;
  /** Club for a goalkeeper shelf, the "no goalkeeper on record" note for Unlinked. */
  subtitle: string | null;
  /** Set on a goalkeeper shelf so "View all" can filter straight to them. */
  gkId: string | null;
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
    const bucket = byGoalkeeper.get(asset.gk_id);
    if (bucket) bucket.push(asset);
    else byGoalkeeper.set(asset.gk_id, [asset]);
  }

  const goalkeeperShelves = Array.from(byGoalkeeper, ([gkId, items]): MediaShelf => {
    const info = resolveGoalkeeper(gkId, roster);
    return {
      key: `goalkeeper-${gkId}`,
      title: info.name,
      subtitle: info.club,
      gkId,
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

/** The unfiltered page subtitle: how much is here and how it is shelved. */
export function describeLibrary(assets: readonly MediaAsset[]): string {
  const goalkeepers = new Set<string>();
  let unlinked = 0;
  for (const asset of assets) {
    if (asset.gk_id) goalkeepers.add(asset.gk_id);
    else unlinked += 1;
  }
  const parts = [plural(assets.length, "asset"), plural(goalkeepers.size, "goalkeeper")];
  if (unlinked > 0) parts.push(`${unlinked} unlinked`);
  return parts.join(" · ");
}
