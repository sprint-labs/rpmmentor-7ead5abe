import { describe, expect, it } from "vitest";
import { goalkeeperByName, rosterGoalkeepersByName, withSeedNarrative } from "./goalkeeper-profile";
import { toGoalkeepers } from "./live-goalkeepers";
import { goalkeepers as seedRoster } from "@/lib/mock-data";
import type { PlayerRosterRow } from "@/lib/players.functions";

function player(over: Partial<PlayerRosterRow> = {}): PlayerRosterRow {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    full_name: "A Goalkeeper",
    current_club: "Some Club",
    parent_club: null,
    on_loan: false,
    league: "EFL Championship",
    nationality: "England",
    instagram_url: null,
    contract_until: "June 2027",
    tier: "Tier 1",
    is_academy: false,
    is_free_agent: false,
    ...over,
  };
}

describe("the narrative the database has no column for", () => {
  // The regression this exists for: resolving a profile from `public.players`
  // alone is correct for every column it holds, and silently blanks the
  // biography, the development plan and the highlight-reel links, because
  // `toGoalkeeper` has nowhere to read them from.
  const seedGk = seedRoster.find((gk) => gk.bio)!;

  it("restores the biography, plan and reel onto a live row", () => {
    const live = toGoalkeepers([player({ full_name: seedGk.name })])[0];
    expect(live.bio).toBeUndefined();
    expect(live.videoLinks).toEqual([]);

    const merged = withSeedNarrative(live);

    expect(merged.bio).toBe(seedGk.bio);
    expect(merged.developmentPlan).toEqual(seedGk.developmentPlan);
    expect(merged.videoLinks).toEqual(seedGk.videoLinks);
    if (seedGk.seasonStats) {
      expect(merged.seasonStats).toEqual(seedGk.seasonStats);
    }
  });

  it("restores Goal.com season stats for James Beadle", () => {
    const live = toGoalkeepers([player({ full_name: "James Beadle" })])[0];
    const merged = withSeedNarrative(live);
    expect(merged.seasonStats?.seasonLabel).toBe("2025/2026");
    expect(merged.seasonStats?.appearances).toBe(38);
    expect(merged.seasonStats?.minutesPlayed).toBe(3420);
  });

  it("leaves every column the database does hold alone", () => {
    const live = toGoalkeepers([
      player({
        full_name: seedGk.name,
        tier: "Tier 4",
        current_club: "Moved Since FC",
        is_free_agent: true,
      }),
    ])[0];

    const merged = withSeedNarrative(live);

    expect(merged.tier).toBe("Tier 4");
    expect(merged.club).toBe("Moved Since FC");
    expect(merged.tags).toContain("Free Agent");
  });

  it("returns a goalkeeper with no seed entry untouched", () => {
    // Anyone signed since the seed was captured has no narrative yet, which is
    // honest — nobody has written one.
    expect(seedRoster.some((gk) => gk.name === "Alfie Smith")).toBe(false);
    const live = toGoalkeepers([player({ full_name: "Alfie Smith" })])[0];

    expect(withSeedNarrative(live)).toBe(live);
  });

  it("matches on the name, apostrophe spelling included", () => {
    const merged = withSeedNarrative(
      toGoalkeepers([player({ full_name: seedGk.name.replace(/\u2019/g, "'") })])[0],
    );
    expect(merged.bio).toBe(seedGk.bio);
  });
});

describe("a name picked on a form resolves to the goalkeeper it names", () => {
  // The regression this exists for: the Match Report picker offered the live
  // roster while the voice-note attachment matched the seed, so attaching audio
  // to a goalkeeper signed since the seed was captured failed with "select a
  // known goalkeeper" — for a name that form had just offered.
  const live = player({ id: "live-1", full_name: "Alfie Smith" });

  it("resolves a live-only goalkeeper", () => {
    expect(seedRoster.some((gk) => gk.name === "Alfie Smith")).toBe(false);
    const resolved = goalkeeperByName("Alfie Smith", [live]);
    expect(resolved?.id).toBe("gk-alfie-smith");
    expect(resolved?.name).toBe("Alfie Smith");
  });

  it("files media under the slug the profile page reads", () => {
    const [mapped] = toGoalkeepers([live]);
    expect(goalkeeperByName(live.full_name, [live])?.id).toBe(mapped.id);
  });

  it("ignores case and spacing, as the picker's own matching does", () => {
    expect(goalkeeperByName("  alfie   smith ", [live])?.name).toBe("Alfie Smith");
  });

  it("still resolves a seed name while the roster query is in flight", () => {
    const seedGk = seedRoster[0];
    expect(goalkeeperByName(seedGk.name, [])?.id).toBe(seedGk.id);
  });

  it("returns null for a name in neither source, and for an empty one", () => {
    expect(goalkeeperByName("Nobody At All", [live])).toBeNull();
    expect(goalkeeperByName("   ", [live])).toBeNull();
  });

  it("does not bring back a goalkeeper the loaded roster no longer holds", () => {
    // Taken off the roster: archived in `public.players`, so absent from the
    // live list, but still in the seed. He must resolve as off the roster.
    const archived = seedRoster[0];
    expect(goalkeeperByName(archived.name, [live])).toBeNull();
  });
});

describe("the Submission Centre's roster lookup", () => {
  const live = player({ id: "live-1", full_name: "Alfie Smith", tier: "Tier 2" });

  it("links reports to the live roster once it has arrived", () => {
    const byName = rosterGoalkeepersByName([live]);
    expect(byName.get("alfie smith")?.id).toBe("gk-alfie-smith");
    expect(byName.get("alfie smith")?.tier).toBe("Tier 2");
  });

  it("leaves a goalkeeper taken off the roster unlinked, even though the seed lists him", () => {
    const archived = seedRoster[0];
    const byName = rosterGoalkeepersByName([live]);
    expect(byName.has(archived.name.toLowerCase())).toBe(false);
    expect(byName.size).toBe(1);
  });

  it("stands in with the seed only while the roster query is in flight", () => {
    for (const pending of [undefined, null, []]) {
      const byName = rosterGoalkeepersByName(pending);
      expect(byName.size).toBe(seedRoster.length);
      expect(byName.get(seedRoster[0].name.toLowerCase())?.id).toBe(seedRoster[0].id);
    }
  });
});
