/**
 * Goalkeeper Distribution counts.
 *
 * Two different questions are answered here, and they must not be mixed:
 *
 *   1. How is the roster spread across the care-cadence tiers? Tier 1–4 plus
 *      Unassigned, over the whole roster. Every goalkeeper lands in exactly one
 *      of those five buckets, so this distribution sums to the roster total and
 *      its percentages sum to 100%.
 *
 *   2. How many goalkeepers hold each status? Academy and Free Agent are
 *      independent booleans on `public.players` — a goalkeeper can be Tier 1
 *      and Academy at once, and seven of them are. Each is counted against the
 *      whole roster on its own, so these percentages are not part of the tier
 *      distribution and are not expected to sum to anything in particular.
 *
 * Mixing the two is what made the old panel unreconcilable: Academy and Free
 * Agent were tier values, so tiering an academy goalkeeper erased the fact that
 * they were in an academy.
 */

export const ROSTER_TIER_LABELS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"] as const;
export const ROSTER_STATUS_LABELS = ["Academy", "Free Agent"] as const;

/**
 * Shown as its own row so the tier distribution reconciles to the roster.
 *
 * Distinct from `NO_TIER_LABEL` in `insight-drilldowns.tsx`, which is the token
 * the insights URL filter carries. This one is the distribution's display label.
 */
export const UNASSIGNED_TIER_LABEL = "Unassigned";

export type RosterTierLabel = (typeof ROSTER_TIER_LABELS)[number];
export type RosterStatusLabel = (typeof ROSTER_STATUS_LABELS)[number];
export type RosterTierRowLabel = RosterTierLabel | typeof UNASSIGNED_TIER_LABEL;

export interface RosterCategoryCount<Label extends string> {
  label: Label;
  count: number;
  /**
   * Share of `denominator`, 0–100, rounded to one decimal place. Always read it
   * together with the denominator it was taken against.
   */
  percent: number;
}

export interface RosterSnapshot {
  /** Tier 1–4 plus Unassigned. Counts sum to `total`; percentages sum to 100. */
  tiers: RosterCategoryCount<RosterTierRowLabel>[];
  /** Academy and Free Agent, each counted independently against `total`. */
  statuses: RosterCategoryCount<RosterStatusLabel>[];
  /** Goalkeepers with no tier recorded. Also present as a row in `tiers`. */
  unassigned: number;
  /** Every live goalkeeper record. The denominator for every percentage above. */
  total: number;
}

/** Row shape the snapshot needs; a subset of `PlayerRosterRow`. */
export interface RosterSnapshotPlayer {
  tier: string | null;
  is_academy?: boolean | null;
  is_free_agent?: boolean | null;
}

/** Percentage of `total`, to one decimal place. Zero total yields zero. */
export function sharePercent(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

/** Count live goalkeeper rows into the distribution's buckets. */
export function buildRosterSnapshot(players: ReadonlyArray<RosterSnapshotPlayer>): RosterSnapshot {
  // Defensive: the dashboard is a whole page, and a malformed response should
  // cost one panel rather than the screen.
  const rows = Array.isArray(players) ? players : [];
  const total = rows.length;

  const tierCounts = new Map<string, number>();
  let unassigned = 0;
  let academy = 0;
  let freeAgent = 0;

  for (const player of rows) {
    if (player.is_academy) academy += 1;
    if (player.is_free_agent) freeAgent += 1;

    const tier = player.tier?.trim();
    // A value outside the database constraint is real data we cannot place;
    // count it as unassigned rather than dropping it from the total, so the
    // rows still reconcile.
    if (!tier || !(ROSTER_TIER_LABELS as readonly string[]).includes(tier)) {
      unassigned += 1;
      continue;
    }
    tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);
  }

  const tiers: RosterCategoryCount<RosterTierRowLabel>[] = ROSTER_TIER_LABELS.map((label) => {
    const count = tierCounts.get(label) ?? 0;
    return { label, count, percent: sharePercent(count, total) };
  });
  tiers.push({
    label: UNASSIGNED_TIER_LABEL,
    count: unassigned,
    percent: sharePercent(unassigned, total),
  });

  return {
    tiers,
    statuses: [
      { label: "Academy", count: academy, percent: sharePercent(academy, total) },
      { label: "Free Agent", count: freeAgent, percent: sharePercent(freeAgent, total) },
    ],
    unassigned,
    total,
  };
}
