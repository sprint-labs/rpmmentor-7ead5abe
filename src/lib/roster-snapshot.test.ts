import { describe, expect, it } from "vitest";
import { buildRosterSnapshot } from "./roster-snapshot";

function countOf(buckets: ReadonlyArray<{ label: string; count: number }>, label: string): number {
  const found = buckets.find((bucket) => bucket.label === label);
  if (!found) throw new Error(`${label} is not a roster snapshot bucket`);
  return found.count;
}

describe("buildRosterSnapshot", () => {
  it("counts each live player into exactly one bucket", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 1" },
      { tier: "Tier 1" },
      { tier: "Tier 2" },
      { tier: "Tier 4" },
      { tier: "Academy" },
      { tier: "Free Agent" },
    ]);

    expect(countOf(snapshot.tiers, "Tier 1")).toBe(2);
    expect(countOf(snapshot.tiers, "Tier 2")).toBe(1);
    expect(countOf(snapshot.tiers, "Tier 3")).toBe(0);
    expect(countOf(snapshot.tiers, "Tier 4")).toBe(1);
    expect(countOf(snapshot.statuses, "Academy")).toBe(1);
    expect(countOf(snapshot.statuses, "Free Agent")).toBe(1);
    expect(snapshot.unassigned).toBe(0);
    expect(snapshot.total).toBe(6);

    const bucketed =
      snapshot.tiers.reduce((total, bucket) => total + bucket.count, 0) +
      snapshot.statuses.reduce((total, bucket) => total + bucket.count, 0) +
      snapshot.unassigned;
    expect(bucketed).toBe(snapshot.total);
  });

  it("reports players with no tier rather than folding them into a band", () => {
    const snapshot = buildRosterSnapshot([
      { tier: "Tier 3" },
      { tier: null },
      { tier: "   " },
      // A value outside the database constraint is still a real player.
      { tier: "Tier 9" },
    ]);

    expect(countOf(snapshot.tiers, "Tier 3")).toBe(1);
    expect(snapshot.unassigned).toBe(3);
    expect(snapshot.total).toBe(4);
  });

  it("returns zeroed buckets for an empty roster instead of guessing", () => {
    const snapshot = buildRosterSnapshot([]);

    expect(snapshot.total).toBe(0);
    expect(snapshot.unassigned).toBe(0);
    expect(snapshot.tiers.every((bucket) => bucket.count === 0)).toBe(true);
    expect(snapshot.statuses.every((bucket) => bucket.count === 0)).toBe(true);
  });
});
