import { describe, expect, it } from "vitest";
import { countCoveredPlayerRecords } from "./dashboard-coverage";

describe("goalkeeper coverage", () => {
  it("counts distinct canonical players and ignores unlinked legacy rows", () => {
    expect(
      countCoveredPlayerRecords([
        { player_id: "player-1" },
        { player_id: "player-1" },
        { player_id: "player-2" },
        { player_id: null },
      ]),
    ).toBe(2);
  });

  it("excludes archived players from the coverage numerator", () => {
    expect(
      countCoveredPlayerRecords(
        [{ player_id: "active" }, { player_id: "archived" }],
        new Set(["active"]),
      ),
    ).toBe(1);
  });
});
