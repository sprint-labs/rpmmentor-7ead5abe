import { describe, expect, it } from "vitest";
import { dutyStatusForGk, goalkeepers } from "./mock-data";
import {
  canonicaliseLegacyTierCategory,
  clearGoalkeeperFilters,
  countActiveGoalkeeperFilters,
  filterGoalkeepers,
  type GoalkeeperFilterState,
} from "./goalkeeper-filters";

const defaultFilters: GoalkeeperFilterState = {
  q: "",
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

const noRatings = new Map();

describe("goalkeeper filter behaviour", () => {
  it("preserves matching by goalkeeper name, club, league and nationality", () => {
    const fields = ["name", "club", "league", "nationality"] as const;

    for (const field of fields) {
      const goalkeeper = goalkeepers.find((candidate) => Boolean(candidate[field]));
      expect(goalkeeper).toBeDefined();

      const query = String(goalkeeper![field]).slice(0, 4).toLowerCase();
      expect(filterGoalkeepers(goalkeepers, { ...defaultFilters, q: query }, noRatings)).toContain(
        goalkeeper,
      );
    }
  });

  it.each(["Tier 1", "Tier 2", "Tier 3", "Tier 4"])("selects %s independently", (tier) => {
    const results = filterGoalkeepers(goalkeepers, { ...defaultFilters, tiers: tier }, noRatings);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((goalkeeper) => goalkeeper.tier === tier)).toBe(true);
  });

  it("combines Tier 1 and Tier 2 without changing the canonical tier values", () => {
    const results = filterGoalkeepers(
      goalkeepers,
      { ...defaultFilters, tiers: "Tier 1,Tier 2" },
      noRatings,
    );
    const expected = goalkeepers.filter(
      (goalkeeper) => goalkeeper.tier === "Tier 1" || goalkeeper.tier === "Tier 2",
    );

    expect(results).toEqual(expected);
  });

  it("combines Tier 3 and Tier 4 without changing the canonical tier values", () => {
    const results = filterGoalkeepers(
      goalkeepers,
      { ...defaultFilters, tiers: "Tier 3,Tier 4" },
      noRatings,
    );
    const expected = goalkeepers.filter(
      (goalkeeper) => goalkeeper.tier === "Tier 3" || goalkeeper.tier === "Tier 4",
    );

    expect(results).toEqual(expected);
  });

  it.each([
    ["Tier 1-2", "Tier 1,Tier 2"],
    ["Tier 3-4", "Tier 3,Tier 4"],
  ])("canonicalises legacy %s URLs to the equivalent canonical tiers on mobile", (cat, tiers) => {
    expect(canonicaliseLegacyTierCategory({ ...defaultFilters, cat })).toEqual({
      ...defaultFilters,
      cat: "All",
      tiers,
    });
  });

  it("preserves the legacy category result set when an existing tier is compatible", () => {
    const legacyFilters = { ...defaultFilters, cat: "Tier 1-2", tiers: "Tier 1" };
    const canonicalFilters = canonicaliseLegacyTierCategory(legacyFilters);

    expect(canonicalFilters).toEqual({ ...defaultFilters, cat: "All", tiers: "Tier 1" });
    expect(filterGoalkeepers(goalkeepers, canonicalFilters!, noRatings)).toEqual(
      filterGoalkeepers(goalkeepers, legacyFilters, noRatings),
    );
  });

  it("does not rewrite a conflicting legacy category because that would widen an empty result set", () => {
    expect(
      canonicaliseLegacyTierCategory({
        ...defaultFilters,
        cat: "Tier 1-2",
        tiers: "Tier 3",
      }),
    ).toBeNull();
  });

  it("clears filters but preserves the separately visible search term", () => {
    expect(
      clearGoalkeeperFilters({
        ...defaultFilters,
        q: "beadle",
        cat: "UK Based",
        duty: "overdue",
        tiers: "Tier 1,Tier 2",
        leagues: "Premier League",
        nats: "England",
        club: "Brighton",
        contract: "expiring12",
        ratingMin: 2,
        loan: "loan",
      }),
    ).toEqual({ ...defaultFilters, q: "beadle" });
  });

  it("counts active filters without counting search", () => {
    expect(countActiveGoalkeeperFilters({ ...defaultFilters, q: "beadle" })).toBe(0);
    expect(
      countActiveGoalkeeperFilters({
        ...defaultFilters,
        q: "beadle",
        cat: "UK Based",
        duty: "overdue",
        tiers: "Tier 1,Tier 2",
        leagues: "Premier League",
        ratingMin: 2,
      }),
    ).toBe(6);
  });

  it("does not alter duty-of-care calculations while filtering", () => {
    const before = goalkeepers.map((goalkeeper) => dutyStatusForGk(goalkeeper));
    filterGoalkeepers(goalkeepers, { ...defaultFilters, tiers: "Tier 1,Tier 2" }, noRatings);
    const after = goalkeepers.map((goalkeeper) => dutyStatusForGk(goalkeeper));

    expect(after).toEqual(before);
  });
});
