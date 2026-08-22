import { describe, expect, it } from "vitest";
import { goalkeepers } from "./mock-data";

describe("goalkeeper highlight reels and core metrics", () => {
  it("gives every goalkeeper a reserved highlight-reel slot (possibly empty)", () => {
    expect(goalkeepers.length).toBeGreaterThan(10);
    for (const gk of goalkeepers) {
      expect(Array.isArray(gk.videoLinks)).toBe(true);
      expect(gk).toHaveProperty("shirtNumber");
    }
  });

  it("populates James Beadle's highlight reel and shirt number", () => {
    const beadle = goalkeepers.find((g) => g.name === "James Beadle");
    expect(beadle).toBeTruthy();
    expect(beadle!.videoLinks.length).toBeGreaterThan(0);
    expect(beadle!.videoLinks[0]).toContain("beadle/highlights");
    expect(beadle!.shirtNumber).toBe(45);
    expect(beadle!.height).toBe("196cm");
    expect(beadle!.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps Brandon Austin's reel pattern as the across-the-board template", () => {
    const austin = goalkeepers.find((g) => g.name === "Brandon Austin");
    expect(austin).toBeTruthy();
    expect(austin!.videoLinks).toEqual(["https://video.rpmgk.com/austin/highlights"]);
    expect(austin!.shirtNumber).toBe(40);
  });

  it("leaves other players with an empty reserved reel slot", () => {
    const other = goalkeepers.find(
      (g) => g.name !== "James Beadle" && g.name !== "Brandon Austin",
    );
    expect(other).toBeTruthy();
    expect(other!.videoLinks).toEqual([]);
    expect(other!.shirtNumber).toBeNull();
  });
});
