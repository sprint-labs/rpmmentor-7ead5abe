/**
 * Where each Goalkeeper Distribution row drills through to.
 *
 * These reuse the filters `/goalkeepers` already has rather than introducing a
 * second filtering mechanism: every link lands on exactly the URL you would
 * reach by clicking that filter on the page yourself.
 *
 * Because the distribution and the roster now read the same table, the count on
 * a row and the number of results at the other end are the same number. Keeping
 * that true is the point of this module, and of its tests.
 */
import {
  UNASSIGNED_TIER_LABEL,
  type RosterStatusLabel,
  type RosterTierRowLabel,
} from "@/lib/roster-snapshot";

/** The subset of the roster page's search params a drill-down sets. */
export interface RosterDrilldownSearch {
  tiers?: string;
  cat?: string;
}

export type DistributionRowLabel = RosterTierRowLabel | RosterStatusLabel;

/**
 * The roster-page filter that selects exactly this row's goalkeepers.
 *
 * Academy and Free Agent are statuses, so they use the page's category filter,
 * which reads the `is_academy` / `is_free_agent` flags. The tiers — Unassigned
 * included — use its tier multi-select.
 */
export function searchForDistributionRow(label: DistributionRowLabel): RosterDrilldownSearch {
  if (label === "Academy") return { cat: "Academy" };
  // The roster page spells this category "Free Agents", plural.
  if (label === "Free Agent") return { cat: "Free Agents" };
  if (label === UNASSIGNED_TIER_LABEL) return { tiers: UNASSIGNED_TIER_LABEL };
  return { tiers: label };
}
