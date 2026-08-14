import { describe, expect, it } from "vitest";
import { goalkeepers } from "./mock-data";

describe("management-controlled roster tiers", () => {
  it("keeps one row per current client and does not invent tier from league", () => {
    expect(goalkeepers).toHaveLength(113);
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

  it("keeps the stored dates instead of Excel's filled 2006 serials", () => {
    const bornBefore2000 = goalkeepers.filter(
      (goalkeeper) => Number(goalkeeper.dob.slice(0, 4)) < 2000,
    );
    expect(bornBefore2000.length).toBeGreaterThan(30);
  });
});
