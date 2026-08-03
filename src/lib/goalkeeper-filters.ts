import { dutyStatusForGk, type DutyLevel, type Goalkeeper } from "./mock-data";

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

export function normaliseGoalkeeperName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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

export function filterGoalkeepers(
  goalkeepers: Goalkeeper[],
  filters: GoalkeeperFilterState,
  ratingsByGoalkeeper: ReadonlyMap<string, GoalkeeperRating>,
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

    if (filters.duty !== "all" && dutyStatusForGk(goalkeeper).level !== (filters.duty as DutyLevel))
      return false;

    if (
      filters.q &&
      !`${goalkeeper.name} ${goalkeeper.club} ${goalkeeper.nationality} ${goalkeeper.league}`
        .toLowerCase()
        .includes(filters.q.toLowerCase())
    )
      return false;

    if (selectedTiers.length && !selectedTiers.includes(goalkeeper.tier)) return false;
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
