import { describe, expect, it } from "vitest";
import { goalkeepers, rosterCategoryCounts } from "./mock-data";

describe("management-controlled roster tiers", () => {
  it("keeps one row per current client and does not invent tier from league", () => {
    expect(goalkeepers).toHaveLength(114);
    expect(
      goalkeepers.some(
        (goalkeeper) => goalkeeper.league === "EFL Championship" && goalkeeper.tier === "Tier 1",
      ),
    ).toBe(true);
  });

  it("treats Academy as a tag on a numbered tier, not a replacement status", () => {
    const academy = goalkeepers.filter((goalkeeper) => goalkeeper.tags.includes("Academy"));
    expect(academy.length).toBeGreaterThan(0);
    expect(academy.every((goalkeeper) => goalkeeper.tier.startsWith("Tier"))).toBe(true);
    expect(academy.every((goalkeeper) => goalkeeper.status !== "Academy")).toBe(true);
  });

  it("counts duty tiers independently from Academy and Free Agent status tags", () => {
    expect(rosterCategoryCounts.tiers.reduce((total, tier) => total + tier.count, 0)).toBe(
      goalkeepers.length,
    );

    for (const tier of rosterCategoryCounts.tiers) {
      expect(tier.count).toBe(
        goalkeepers.filter((goalkeeper) => goalkeeper.tier === tier.label).length,
      );
    }

    for (const status of rosterCategoryCounts.statuses) {
      expect(status.count).toBe(
        goalkeepers.filter((goalkeeper) => goalkeeper.tags.includes(status.label)).length,
      );
      expect(status.count).toBeGreaterThan(0);
    }
  });

  it("keeps the stored dates instead of Excel's filled 2006 serials", () => {
    const bornBefore2000 = goalkeepers.filter(
      (goalkeeper) => Number(goalkeeper.dob.slice(0, 4)) < 2000,
    );
    expect(bornBefore2000.length).toBeGreaterThan(30);
  });
});
