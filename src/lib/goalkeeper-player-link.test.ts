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

describe("apostrophes in names", () => {
  it("matches a curly apostrophe to the straight one the database stores", () => {
    // Real roster data: `players.full_name` holds "Rich O'Donnell" (U+0027)
    // while the legacy profile carries "Rich O’Donnell" (U+2019). Before
    // these were reconciled his profile could not find his player record, so
    // Duty of Care, Edit Details and his media were all silently missing.
    const players = [{ id: "p9", full_name: "Rich O'Donnell" }];

    expect(findPlayerByName(players, "Rich O\u2019Donnell")?.id).toBe("p9");
    expect(findPlayerByName(players, "rich o\u2019donnell")?.id).toBe("p9");
  });

  it("matches in the other direction too", () => {
    const players = [{ id: "p9", full_name: "Rich O\u2019Donnell" }];

    expect(findPlayerByName(players, "Rich O'Donnell")?.id).toBe("p9");
  });

  it("still tells genuinely different names apart", () => {
    const players = [{ id: "p9", full_name: "Rich O'Donnell" }];

    expect(findPlayerByName(players, "Rich O'Donnel")).toBeNull();
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
