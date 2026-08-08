import { describe, expect, it } from "vitest";
import {
  findPlayerByName,
  interactionBelongsToGoalkeeper,
  legacyGkSlugForName,
  normalisePersonName,
} from "@/lib/goalkeeper-player-link";
import { COMPETITIONS } from "@/lib/competitions";

describe("goalkeeper-player-link", () => {
  it("normalises names for matching", () => {
    expect(normalisePersonName("  Harrison   Male ")).toBe("harrison male");
  });

  it("builds the legacy gk slug", () => {
    expect(legacyGkSlugForName("Harrison Male")).toBe("gk-harrison-male");
  });

  it("finds a player by exact name", () => {
    const players = [
      { id: "p1", full_name: "James Beadle" },
      { id: "p2", full_name: "Harrison Male" },
    ];
    expect(findPlayerByName(players, "harrison male")?.id).toBe("p2");
    expect(findPlayerByName(players, "Nobody")).toBeNull();
  });

  it("matches interactions by slug, player id, or name", () => {
    const gk = { id: "gk-harrison-male", name: "Harrison Male" };
    expect(
      interactionBelongsToGoalkeeper(
        { gkSlug: "gk-harrison-male", goalkeeperName: "X", playerId: null },
        gk,
        null,
      ),
    ).toBe(true);
    expect(
      interactionBelongsToGoalkeeper(
        { gkSlug: "", goalkeeperName: "Other", playerId: "p2" },
        gk,
        "p2",
      ),
    ).toBe(true);
    expect(
      interactionBelongsToGoalkeeper(
        { gkSlug: "", goalkeeperName: "Harrison Male", playerId: null },
        gk,
        null,
      ),
    ).toBe(true);
    expect(
      interactionBelongsToGoalkeeper(
        { gkSlug: "gk-other", goalkeeperName: "Other", playerId: "px" },
        gk,
        "p2",
      ),
    ).toBe(false);
  });
});

describe("competitions", () => {
  it("includes the cups and age groups David requested", () => {
    for (const needed of [
      "Carabao Cup",
      "EFL Trophy",
      "FA Cup",
      "Premier League Under 18s",
      "Premier League Under 16s",
    ]) {
      expect(COMPETITIONS).toContain(needed);
    }
  });
});
