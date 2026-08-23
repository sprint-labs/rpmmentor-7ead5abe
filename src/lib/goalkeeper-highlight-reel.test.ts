import { describe, expect, it } from "vitest";
import { goalkeepers } from "./mock-data";

describe("goalkeeper highlight reels and core metrics", () => {
  it("gives every goalkeeper a reserved highlight-reel slot", () => {
    expect(goalkeepers.length).toBeGreaterThan(10);
    for (const gk of goalkeepers) {
      expect(gk.videoLinks).toEqual([]);
      expect(gk).toHaveProperty("shirtNumber");
    }
  });

  it("does not present generated or invented profile data as recorded facts", () => {
    for (const gk of goalkeepers) {
      expect(gk.height).toBeNull();
      expect(gk.shirtNumber).toBeNull();
      expect(gk.foot).toBeNull();
      expect(gk.videoLinks.some((url) => url.includes("video.rpmgk.com"))).toBe(false);
    }
  });
});
