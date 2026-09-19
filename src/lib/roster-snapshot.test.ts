import { describe, expect, it } from "vitest";
import {
  buildRosterSnapshot,
  sharePercent,
  UNASSIGNED_TIER_LABEL,
  type RosterCategoryCount,
} from "./roster-snapshot";

function rowFor(
  buckets: ReadonlyArray<RosterCategoryCount<string>>,
  label: string,
): RosterCategoryCount<string> {
  const found = buckets.find((bucket) => bucket.label === label);
  if (!found) throw new Error(`${label} is not a roster snapshot bucket`);
  return found;
}

const countOf = (buckets: ReadonlyArray<RosterCategoryCount<string>>, label: string) =>
  rowFor(buckets, label).count;
const percentOf = (buckets: ReadonlyArray<RosterCategoryCount<string>>, label: string) =>
  rowFor(buckets, label).percent;

describe("the tier distribution", () => {
  it("puts every goalkeeper in exactly one tier bucket, including Unassigned", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 1" },
      { tier: "Tier 1" },
      { tier: "Tier 2" },
      { tier: "Tier 4" },
      { tier: null },
    ]);

    expect(countOf(snapshot.tiers, "Tier 1")).toBe(2);
    expect(countOf(snapshot.tiers, "Tier 2")).toBe(1);
    expect(countOf(snapshot.tiers, "Tier 3")).toBe(0);
    expect(countOf(snapshot.tiers, "Tier 4")).toBe(1);
    expect(countOf(snapshot.tiers, UNASSIGNED_TIER_LABEL)).toBe(1);

    // The whole point of the rewrite: the rows reconcile to the roster.
    const bucketed = snapshot.tiers.reduce((total, bucket) => total + bucket.count, 0);
    expect(bucketed).toBe(snapshot.total);
  });

  it("gives percentages that sum to 100 across the tier rows", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 1" },
      { tier: "Tier 2" },
      { tier: "Tier 3" },
      { tier: "Tier 4" },
    ]);

    const summed = snapshot.tiers.reduce((total, bucket) => total + bucket.percent, 0);
    expect(summed).toBeCloseTo(100, 5);
  });

  it("counts a goalkeeper with no tier as Unassigned rather than folding them into a band", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 3" },
      { tier: null },
      { tier: "   " },
      // A value outside the database constraint is still a real goalkeeper.
      { tier: "Tier 9" },
    ]);

    expect(countOf(snapshot.tiers, "Tier 3")).toBe(1);
    expect(snapshot.unassigned).toBe(3);
    expect(countOf(snapshot.tiers, UNASSIGNED_TIER_LABEL)).toBe(3);
    expect(snapshot.total).toBe(4);
  });

  it("no longer treats Academy or Free Agent as a tier", () => {
    // These were tier values before the flags existed. A row that somehow still
    // carries one is unplaceable, so it counts as Unassigned — never as a tier.
    const snapshot = buildRosterSnapshot([{ tier: "Academy" }, { tier: "Free Agent" }]);

    expect(snapshot.tiers.filter((bucket) => bucket.label !== UNASSIGNED_TIER_LABEL)).toEqual([
      { label: "Tier 1", count: 0, percent: 0 },
      { label: "Tier 2", count: 0, percent: 0 },
      { label: "Tier 3", count: 0, percent: 0 },
      { label: "Tier 4", count: 0, percent: 0 },
    ]);
    expect(snapshot.unassigned).toBe(2);
  });
});

describe("Academy and Free Agent as independent statuses", () => {
  it("counts a goalkeeper who is both tiered and Academy in both places", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 1", is_academy: true },
      { tier: "Tier 1" },
      { tier: "Tier 3", is_academy: true },
    ]);

    // He keeps his tier AND his status. Under the old single-column model one
    // of these two numbers had to be wrong.
    expect(countOf(snapshot.tiers, "Tier 1")).toBe(2);
    expect(countOf(snapshot.tiers, "Tier 3")).toBe(1);
    expect(countOf(snapshot.statuses, "Academy")).toBe(2);
  });

  it("lets a goalkeeper hold both statuses at once", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 4", is_academy: true, is_free_agent: true },
    ]);

    expect(countOf(snapshot.statuses, "Academy")).toBe(1);
    expect(countOf(snapshot.statuses, "Free Agent")).toBe(1);
    expect(countOf(snapshot.tiers, "Tier 4")).toBe(1);
    expect(snapshot.total).toBe(1);
  });

  it("takes each status percentage against the whole roster, not against each other", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 1", is_academy: true },
      { tier: "Tier 1" },
      { tier: "Tier 2" },
      { tier: "Tier 2" },
    ]);

    // 1 of 4 — not 100% of the one goalkeeper who holds a status.
    expect(percentOf(snapshot.statuses, "Academy")).toBe(25);
    expect(percentOf(snapshot.statuses, "Free Agent")).toBe(0);
  });

  it("treats a missing flag as false rather than counting it", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 1", is_academy: null, is_free_agent: undefined },
    ]);

    expect(countOf(snapshot.statuses, "Academy")).toBe(0);
    expect(countOf(snapshot.statuses, "Free Agent")).toBe(0);
  });
});

describe("edge cases", () => {
  it("returns zeroed buckets for an empty roster instead of guessing", () => {
    const snapshot = buildRosterSnapshot([]);

    expect(snapshot.total).toBe(0);
    expect(snapshot.unassigned).toBe(0);
    expect(snapshot.tiers.every((bucket) => bucket.count === 0 && bucket.percent === 0)).toBe(true);
    expect(snapshot.statuses.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it("survives a malformed response rather than taking the dashboard down", () => {
    const snapshot = buildRosterSnapshot(null as never);

    expect(snapshot.total).toBe(0);
    expect(snapshot.tiers).toHaveLength(5);
  });
});

describe("sharePercent", () => {
  it("rounds to one decimal place", () => {
    expect(sharePercent(1, 3)).toBe(33.3);
    expect(sharePercent(2, 3)).toBe(66.7);
  });

  it("is zero for an empty roster rather than NaN", () => {
    expect(sharePercent(0, 0)).toBe(0);
  });

  it("matches the live roster's real figures", () => {
    // 116 on the roster at the time of the Academy/Free Agent migration.
    expect(sharePercent(32, 116)).toBe(27.6);
    expect(sharePercent(8, 116)).toBe(6.9);
    expect(sharePercent(1, 116)).toBe(0.9);
  });
});
