/**
 * Roster Snapshot counts.
 *
 * `public.players.tier` is a single column constrained to
 * 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | 'Academy' | 'Free Agent'.
 * The panel presents the numbered tiers as care-cadence bands and the other two
 * as status groups, but a player holds exactly one of them — so the buckets are
 * mutually exclusive and the counts add up to the roster total.
 *
 * A player whose tier has never been set is counted as unassigned rather than
 * being folded into a band it does not belong to.
 */

export const ROSTER_TIER_LABELS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"] as const;
export const ROSTER_STATUS_LABELS = ["Academy", "Free Agent"] as const;

export type RosterTierLabel = (typeof ROSTER_TIER_LABELS)[number];
export type RosterStatusLabel = (typeof ROSTER_STATUS_LABELS)[number];

export interface RosterCategoryCount<Label extends string> {
  label: Label;
  count: number;
}

export interface RosterSnapshot {
  tiers: RosterCategoryCount<RosterTierLabel>[];
  statuses: RosterCategoryCount<RosterStatusLabel>[];
  /** Players on the roster with no tier recorded. */
  unassigned: number;
  /** Every live player record, whatever their tier. */
  total: number;
}

/** Count live player rows into the snapshot's buckets. */
export function buildRosterSnapshot(
  players: ReadonlyArray<{ tier: string | null }>,
): RosterSnapshot {
  const counts = new Map<string, number>();
  let unassigned = 0;

  for (const player of players) {
    const tier = player.tier?.trim();
    if (!tier) {
      unassigned += 1;
      continue;
    }
    const known =
      (ROSTER_TIER_LABELS as readonly string[]).includes(tier) ||
      (ROSTER_STATUS_LABELS as readonly string[]).includes(tier);
    if (!known) {
      // A value outside the database constraint is real data we cannot place;
      // report it as unassigned rather than dropping it from the total.
      unassigned += 1;
      continue;
    }
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }

  return {
    tiers: ROSTER_TIER_LABELS.map((label) => ({ label, count: counts.get(label) ?? 0 })),
    statuses: ROSTER_STATUS_LABELS.map((label) => ({ label, count: counts.get(label) ?? 0 })),
    unassigned,
    total: players.length,
  };
}
