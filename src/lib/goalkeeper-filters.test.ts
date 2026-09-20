import { describe, expect, it } from "vitest";
import { dutyStatusForGk, goalkeepers, type DutyLevel } from "./mock-data";
import {
  canonicaliseLegacyTierCategory,
  clearGoalkeeperFilters,
  countActiveGoalkeeperFilters,
  filterGoalkeepers,
  normaliseGoalkeeperName,
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

  it.each([
    ["Academy", "Academy"],
    ["Free Agents", "Free Agent"],
  ] as const)("selects the %s player status tag independently", (category, tag) => {
    const results = filterGoalkeepers(goalkeepers, { ...defaultFilters, cat: category }, noRatings);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((goalkeeper) => goalkeeper.tags.includes(tag))).toBe(true);
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

describe("the duty filter reads the live view", () => {
  // The roster chips, the Duty of Care column and this filter must all be the
  // same answer. They were not: the column and chips read
  // `public.player_duty_of_care`, while the filter recomputed from a seed
  // interactions array that is empty — so every goalkeeper came back
  // "not enough data" and selecting "Overdue 15" returned nothing at all.
  const overdueNames = new Set(goalkeepers.slice(0, 3).map((g) => g.name));
  const dutyLevelFor = (name: string): DutyLevel =>
    overdueNames.has(name) ? "overdue" : "up_to_date";

  it("returns the goalkeepers the supplied lookup calls overdue", () => {
    const results = filterGoalkeepers(
      goalkeepers,
      { ...defaultFilters, duty: "overdue" },
      noRatings,
      dutyLevelFor,
    );

    expect(results).toHaveLength(overdueNames.size);
    expect(results.every((g) => overdueNames.has(g.name))).toBe(true);
  });

  it("returns everyone else for the complementary level", () => {
    const results = filterGoalkeepers(
      goalkeepers,
      { ...defaultFilters, duty: "up_to_date" },
      noRatings,
      dutyLevelFor,
    );

    expect(results).toHaveLength(goalkeepers.length - overdueNames.size);
  });

  it("counts the same goalkeepers the chip counts", () => {
    // A chip showing "Overdue 15" and a filter returning 15 rows are the same
    // question asked twice; the numbers cannot be allowed to diverge.
    const chipCount = goalkeepers.filter((g) => dutyLevelFor(g.name) === "overdue").length;
    const filtered = filterGoalkeepers(
      goalkeepers,
      { ...defaultFilters, duty: "overdue" },
      noRatings,
      dutyLevelFor,
    );

    expect(filtered).toHaveLength(chipCount);
  });

  it("never narrows the roster when no duty filter is applied", () => {
    expect(
      filterGoalkeepers(goalkeepers, { ...defaultFilters, duty: "all" }, noRatings, dutyLevelFor),
    ).toHaveLength(goalkeepers.length);
  });
});

describe("normaliseGoalkeeperName folds the two apostrophes", () => {
  // Every caller keys one table's spelling against another's, and the live
  // database uses both forms: `public.players` holds `Rich O'Donnell` straight,
  // `match_reports_cache` holds `Max O\u2019Leary` curly. A fold that only
  // lowercases silently drops the row it was asked to find — a goalkeeper's
  // rating, their duty status, their reports link.
  it("treats a straight and a curly apostrophe as the same name", () => {
    expect(normaliseGoalkeeperName("Rich O\u2019Donnell")).toBe(
      normaliseGoalkeeperName("Rich O'Donnell"),
    );
    expect(normaliseGoalkeeperName("Max O\u2019Leary")).toBe(
      normaliseGoalkeeperName("Max O'Leary"),
    );
  });

  it("still folds case and collapses whitespace", () => {
    expect(normaliseGoalkeeperName("  JAMES   Beadle ")).toBe("james beadle");
  });

  it("keeps different people apart", () => {
    expect(normaliseGoalkeeperName("Rich O'Donnell")).not.toBe(
      normaliseGoalkeeperName("Joe McDonnell"),
    );
  });
});
