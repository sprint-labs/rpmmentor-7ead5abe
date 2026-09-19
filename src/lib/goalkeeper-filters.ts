import { type DutyLevel, type Goalkeeper } from "./mock-data";
import { UNASSIGNED_TIER_LABEL } from "./roster-snapshot";
import { normalisePersonName } from "./goalkeeper-player-link";

export type GoalkeeperFilterState = {
  q: string;
  cat: string;
  duty: string;
  tiers: string;
  leagues: string;
  nats: string;
  club: string;
  contract: string;
  ratingMin: number;
  ratingMax: number;
  loan: string;
};

export type GoalkeeperRating = { average: number; reportCount: number };

export const csv = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
export const toCsv = (values: string[]) => values.join(",");
export const toggleFrom = (values: string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
export const clampRating = (value: number) => Math.max(1, Math.min(5, Math.round(value * 10) / 10));

const LEGACY_TIER_CATEGORY_TIERS = {
  "Tier 1-2": ["Tier 1", "Tier 2"],
  "Tier 3-4": ["Tier 3", "Tier 4"],
} as const;

/**
 * Fold a goalkeeper name for keying across tables.
 *
 * Delegates to `normalisePersonName` rather than lowercasing alone: every
 * caller keys one table's spelling against another's — roster names against
 * report names, duty rows, stored event names — and `public.players` spells
 * an apostrophe straight (`Rich O'Donnell`) where `match_reports_cache`
 * spells it curly (`Max O\u2019Leary`). A fold that ignores that silently
 * drops the row it was asked to find.
 */
export function normaliseGoalkeeperName(value: string): string {
  return normalisePersonName(value);
}

export function clearGoalkeeperFilters(filters: GoalkeeperFilterState): GoalkeeperFilterState {
  return {
    ...filters,
    cat: "All",
    duty: "all",
    tiers: "",
    leagues: "",
    nats: "",
    club: "",
    contract: "any",
    ratingMin: 1,
    ratingMax: 5,
    loan: "any",
  };
}

/**
 * Rewrites the retired grouped category URL values to the canonical tier
 * multi-select without changing the set of results. A conflicting existing
 * tier selection intentionally remains untouched: an empty tier CSV means no
 * tier constraint, which would widen a currently empty result set.
 */
export function canonicaliseLegacyTierCategory(
  filters: GoalkeeperFilterState,
): GoalkeeperFilterState | null {
  const categoryTiers =
    LEGACY_TIER_CATEGORY_TIERS[filters.cat as keyof typeof LEGACY_TIER_CATEGORY_TIERS];

  if (!categoryTiers) return null;

  const selectedTiers = csv(filters.tiers);
  const canonicalTiers = selectedTiers.length
    ? categoryTiers.filter((tier) => selectedTiers.includes(tier))
    : [...categoryTiers];

  if (selectedTiers.length && canonicalTiers.length === 0) return null;

  return {
    ...filters,
    cat: "All",
    tiers: toCsv(canonicalTiers),
  };
}

export function countActiveGoalkeeperFilters(filters: GoalkeeperFilterState): number {
  const selectedTiers = csv(filters.tiers);
  const selectedLeagues = csv(filters.leagues);
  const selectedNats = csv(filters.nats);
  const ratingFilterActive =
    clampRating(filters.ratingMin) !== 1 || clampRating(filters.ratingMax) !== 5;

  return (
    (filters.cat !== "All" ? 1 : 0) +
    (filters.duty !== "all" ? 1 : 0) +
    selectedTiers.length +
    selectedLeagues.length +
    selectedNats.length +
    (filters.club ? 1 : 0) +
    (filters.contract !== "any" ? 1 : 0) +
    (filters.loan !== "any" ? 1 : 0) +
    (ratingFilterActive ? 1 : 0)
  );
}

/**
 * Duty level for one goalkeeper, supplied by the caller.
 *
 * The filter does not compute this. `duty_of_care_at()` is the only thing
 * entitled to decide a duty status, and the roster already reads its projection
 * for the column and the chips — so the filter takes the same answer rather
 * than working one out of its own.
 */
export type DutyLevelLookup = (goalkeeperName: string) => DutyLevel;

/** Used when a caller filters nothing by duty; never narrows the result set. */
const ALL_DUTY_UNKNOWN: DutyLevelLookup = () => "not_enough_data";

export function filterGoalkeepers(
  goalkeepers: Goalkeeper[],
  filters: GoalkeeperFilterState,
  ratingsByGoalkeeper: ReadonlyMap<string, GoalkeeperRating>,
  dutyLevelFor: DutyLevelLookup = ALL_DUTY_UNKNOWN,
  now = Date.now(),
) {
  const selectedTiers = csv(filters.tiers);
  const selectedLeagues = csv(filters.leagues);
  const selectedNats = csv(filters.nats);
  const ratingMin = clampRating(filters.ratingMin);
  const ratingMax = clampRating(Math.max(filters.ratingMax, ratingMin));
  const ratingFilterActive = ratingMin !== 1 || ratingMax !== 5;
  const msYear = 365 * 24 * 60 * 60 * 1000;

  return goalkeepers.filter((goalkeeper) => {
    if (filters.cat === "UK Based" && goalkeeper.region !== "UK Based") return false;
    if (filters.cat === "Overseas" && goalkeeper.region !== "Overseas") return false;
    if (filters.cat === "Free Agents" && !goalkeeper.tags.includes("Free Agent")) return false;
    if (filters.cat === "Academy" && !goalkeeper.tags.includes("Academy")) return false;
    if (filters.cat === "Tier 1-2" && goalkeeper.tier !== "Tier 1" && goalkeeper.tier !== "Tier 2")
      return false;
    if (filters.cat === "Tier 3-4" && goalkeeper.tier !== "Tier 3" && goalkeeper.tier !== "Tier 4")
      return false;

    if (filters.duty !== "all" && dutyLevelFor(goalkeeper.name) !== (filters.duty as DutyLevel))
      return false;

    if (
      filters.q &&
      !`${goalkeeper.name} ${goalkeeper.club} ${goalkeeper.nationality} ${goalkeeper.league}`
        .toLowerCase()
        .includes(filters.q.toLowerCase())
    )
      return false;

    // `Unassigned` is a selectable tier in its own right: a goalkeeper with no
    // tier is someone waiting on a decision, not someone to hide from the list.
    if (selectedTiers.length && !selectedTiers.includes(goalkeeper.tier ?? UNASSIGNED_TIER_LABEL))
      return false;
    if (selectedLeagues.length && !selectedLeagues.includes(goalkeeper.league)) return false;
    if (selectedNats.length && !selectedNats.includes(goalkeeper.nationality)) return false;

    if (filters.club) {
      const haystack = `${goalkeeper.club} ${goalkeeper.parentClub ?? ""}`.toLowerCase();
      if (!haystack.includes(filters.club.toLowerCase())) return false;
    }

    if (filters.loan === "loan" && !goalkeeper.onLoan) return false;
    if (filters.loan === "permanent" && goalkeeper.onLoan) return false;

    if (filters.contract !== "any") {
      const contractUntil = goalkeeper.contractUntil;
      if (filters.contract === "expired") {
        if (contractUntil !== "—" && new Date(contractUntil).getTime() > now) return false;
      } else if (filters.contract === "expiring12") {
        if (contractUntil === "—") return false;
        const timestamp = new Date(contractUntil).getTime();
        if (!(timestamp >= now && timestamp <= now + msYear)) return false;
      } else if (filters.contract === "expiring24") {
        if (contractUntil === "—") return false;
        const timestamp = new Date(contractUntil).getTime();
        if (!(timestamp >= now && timestamp <= now + 2 * msYear)) return false;
      } else if (/^\d{4}$/.test(filters.contract)) {
        if (contractUntil === "—" || contractUntil.slice(0, 4) !== filters.contract) return false;
      }
    }

    if (ratingFilterActive) {
      const rating = ratingsByGoalkeeper.get(normaliseGoalkeeperName(goalkeeper.name))?.average;
      if (rating == null || rating < ratingMin || rating > ratingMax) return false;
    }

    return true;
  });
}
