import { describe, expect, it } from "vitest";
import { goalkeeperByName, resolveGoalkeeperProfile } from "./goalkeeper-profile";
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

describe("every slug the roster can produce resolves to a profile", () => {
  // The regression this exists for: the roster listed `public.players` while
  // the profile resolved against the seed array, so anyone signed since the
  // seed was captured was listed on /goalkeepers and then told their own
  // profile did not exist.
  const rows = [
    player({ id: "live-1", full_name: "Alfie Smith", tier: null, is_academy: true }),
    player({ id: "live-2", full_name: "Daniel Barden", tier: null }),
  ];

  it.each(rows.map((row) => row.full_name))("%s has a profile", (name) => {
    const slug = toGoalkeepers(rows).find((gk) => gk.name === name)!.id;

    // Precondition: this is genuinely a live-only goalkeeper.
    expect(seedRoster.some((gk) => gk.id === slug)).toBe(false);

    const { gk } = resolveGoalkeeperProfile(rows, slug);
    expect(gk).not.toBeNull();
    expect(gk!.name).toBe(name);
  });

  it("resolves every live row the roster would list", () => {
    const resolved = toGoalkeepers(rows).map((gk) => resolveGoalkeeperProfile(rows, gk.id).gk);
    expect(resolved.every(Boolean)).toBe(true);
  });
});

describe("the live row wins wherever the database has a column", () => {
  const seedGk = seedRoster[0];

  it("shows the live tier, club and status, not the seed's", () => {
    const row = player({
      full_name: seedGk.name,
      tier: "Tier 4",
      current_club: "Moved Since The Seed FC",
      is_free_agent: true,
    });

    const { gk } = resolveGoalkeeperProfile([row], seedGk.id);

    expect(gk!.tier).toBe("Tier 4");
    expect(gk!.club).toBe("Moved Since The Seed FC");
    expect(gk!.tags).toContain("Free Agent");
  });

  it("keeps the narrative fields the database has no column for", () => {
    const row = player({ full_name: seedGk.name });
    const { gk } = resolveGoalkeeperProfile([row], seedGk.id);

    expect(gk!.bio).toBe(seedGk.bio);
    expect(gk!.developmentPlan).toEqual(seedGk.developmentPlan);
    expect(gk!.videoLinks).toEqual(seedGk.videoLinks);
  });

  it("reports the live row so the page can link Duty of Care to it", () => {
    const row = player({ id: "live-3", full_name: seedGk.name });
    const { livePlayer, seedGk: matchedSeed } = resolveGoalkeeperProfile([row], seedGk.id);

    expect(livePlayer?.id).toBe("live-3");
    expect(matchedSeed?.id).toBe(seedGk.id);
  });
});

describe("while the roster is still loading, or when the slug is nobody", () => {
  it("falls back to the seed rather than showing nothing", () => {
    // The roster query has not answered yet. A goalkeeper the seed knows about
    // should render immediately instead of flashing "not found".
    const { gk } = resolveGoalkeeperProfile(undefined, seedRoster[0].id);
    expect(gk?.name).toBe(seedRoster[0].name);
  });

  it("returns null for a slug in neither source", () => {
    expect(resolveGoalkeeperProfile([], "gk-nobody-at-all").gk).toBeNull();
    expect(resolveGoalkeeperProfile(null, "gk-nobody-at-all").gk).toBeNull();
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
});
