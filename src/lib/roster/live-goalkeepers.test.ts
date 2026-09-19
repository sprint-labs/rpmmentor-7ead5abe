import { describe, expect, it } from "vitest";
import { findGoalkeeperById, toGoalkeeper, toGoalkeepers } from "./live-goalkeepers";
import type { PlayerRosterRow } from "@/lib/players.functions";

function row(over: Partial<PlayerRosterRow> = {}): PlayerRosterRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    full_name: "Harrison Male",
    current_club: "York City",
    parent_club: null,
    on_loan: false,
    league: "National League",
    nationality: "England",
    instagram_url: null,
    contract_until: "June 2027",
    tier: "Tier 3",
    is_academy: false,
    is_free_agent: false,
    ...over,
  };
}

describe("identity and URLs", () => {
  it("keeps the legacy slug so existing profile links still resolve", () => {
    // `/goalkeepers/gk-harrison-male` is a real, bookmarkable URL. The id is
    // deliberately NOT players.id.
    expect(toGoalkeeper(row()).id).toBe("gk-harrison-male");
  });

  it("builds the same slug for a name carrying punctuation", () => {
    expect(toGoalkeeper(row({ full_name: "Rich O'Donnell" })).id).toBe("gk-rich-o-donnell");
  });

  it("derives initials from the stored name", () => {
    expect(toGoalkeeper(row()).initials).toBe("HM");
  });
});

describe("contract dates", () => {
  // `players.contract_until` holds "June 2027" for 113 of 116 live rows, while
  // the contract sort, the expiry filter and the year dropdown all assume ISO.
  // Getting this wrong breaks all three silently.
  it("converts the stored month-and-year into ISO", () => {
    expect(toGoalkeeper(row({ contract_until: "June 2027" })).contractUntil).toBe("2027-06-30");
    expect(toGoalkeeper(row({ contract_until: "December 2026" })).contractUntil).toBe("2026-12-30");
  });

  it("yields a four-digit year for the contract-year dropdown", () => {
    // The dropdown reads `contractUntil.slice(0, 4)`.
    expect(toGoalkeeper(row({ contract_until: "June 2029" })).contractUntil.slice(0, 4)).toBe(
      "2029",
    );
  });

  it("sorts chronologically as a plain string", () => {
    const dates = ["June 2029", "January 2026", "December 2026"]
      .map((c) => toGoalkeeper(row({ contract_until: c })).contractUntil)
      .sort();

    expect(dates).toEqual(["2026-01-30", "2026-12-30", "2029-06-30"]);
  });

  it("reports no contract as the em-dash the filters already understand", () => {
    expect(toGoalkeeper(row({ contract_until: null })).contractUntil).toBe("—");
    expect(toGoalkeeper(row({ contract_until: "   " })).contractUntil).toBe("—");
  });
});

describe("tier, Academy and Free Agent", () => {
  it("carries a tier and its numeric level", () => {
    const gk = toGoalkeeper(row({ tier: "Tier 2" }));

    expect(gk.tier).toBe("Tier 2");
    expect(gk.tierLevel).toBe(2);
  });

  it("reports an untiered goalkeeper as null rather than guessing a tier", () => {
    const gk = toGoalkeeper(row({ tier: null }));

    expect(gk.tier).toBeNull();
    expect(gk.tierLevel).toBeNull();
    expect(gk.status).toBeNull();
  });

  it("treats a value outside the constraint as untiered", () => {
    expect(toGoalkeeper(row({ tier: "Tier 9" })).tier).toBeNull();
  });

  it("lets a goalkeeper hold a tier and Academy at once", () => {
    // The whole point of the flags: seven goalkeepers are both, and the old
    // single column could only ever record one of the two.
    const gk = toGoalkeeper(row({ tier: "Tier 1", is_academy: true }));

    expect(gk.tier).toBe("Tier 1");
    expect(gk.tags).toEqual(["Academy"]);
  });

  it("carries both statuses when both are set", () => {
    const gk = toGoalkeeper(row({ is_academy: true, is_free_agent: true }));

    expect(gk.tags).toEqual(["Academy", "Free Agent"]);
  });

  it("carries no tags when neither is set", () => {
    expect(toGoalkeeper(row()).tags).toEqual([]);
  });
});

describe("fields read straight from the database", () => {
  it("prefers the stored club, league, nationality and loan status", () => {
    const gk = toGoalkeeper(
      row({
        current_club: "Millwall",
        league: "EFL Championship",
        nationality: "New Zealand",
        parent_club: "Brighton & Hove Albion",
        on_loan: true,
        instagram_url: "https://instagram.com/example/",
      }),
    );

    expect(gk.club).toBe("Millwall");
    expect(gk.league).toBe("EFL Championship");
    expect(gk.nationality).toBe("New Zealand");
    expect(gk.parentClub).toBe("Brighton & Hove Albion");
    expect(gk.onLoan).toBe(true);
    expect(gk.instagram).toBe("https://instagram.com/example/");
  });

  it("derives region from the live league rather than storing it twice", () => {
    expect(toGoalkeeper(row({ league: "EFL Championship" })).region).toBe("UK Based");
    expect(toGoalkeeper(row({ league: "MLS" })).region).toBe("Overseas");
    expect(toGoalkeeper(row({ league: "Free Agent" })).region).toBe("Free Agent");
  });
});

describe("presentation fields with no column yet", () => {
  it("fills them from the isolated seed lookup when the goalkeeper is known", () => {
    // Harrison Male is in the seed, so his date of birth and height come from
    // there until `players` carries them.
    const gk = toGoalkeeper(row({ full_name: "Harrison Male" }));

    expect(gk.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("leaves them empty for a goalkeeper added since the seed was captured", () => {
    // Alfie Smith and Daniel Barden are live-only. Rendering "not recorded" is
    // honest; inventing a height would not be.
    const gk = toGoalkeeper(row({ full_name: "Alfie Smith" }));

    expect(gk.height).toBeNull();
    expect(gk.shirtNumber).toBeNull();
    expect(gk.foot).toBeNull();
    expect(gk.profileImage).toBeUndefined();
  });
});

describe("the placeholders that are not carried across", () => {
  it("invents no rating, recommendation or interaction dates", () => {
    // These were seeded random numbers. The roster's rating column averages
    // real match reports and duty of care reads the database view, so nothing
    // on screen depends on them.
    const gk = toGoalkeeper(row());

    expect(gk.rating).toBe(0);
    expect(gk.potential).toBe(0);
    expect(gk.lastInteraction).toBe("");
    expect(gk.nextInteraction).toBe("");
  });

  it("assigns no mentor, because mentors are not assigned per goalkeeper", () => {
    expect(toGoalkeeper(row()).mentorId).toBe("");
  });
});

describe("toGoalkeepers", () => {
  it("preserves the order the database returned", () => {
    const rows = [row({ full_name: "Adam Davies" }), row({ full_name: "Ben Hamer" })];

    expect(toGoalkeepers(rows).map((gk) => gk.name)).toEqual(["Adam Davies", "Ben Hamer"]);
  });

  it("returns an empty roster rather than throwing on a malformed response", () => {
    expect(toGoalkeepers(null)).toEqual([]);
    expect(toGoalkeepers(undefined)).toEqual([]);
  });
});

describe("findGoalkeeperById", () => {
  it("resolves a live-only goalkeeper by the slug the list emits", () => {
    // Alfie Smith and Daniel Barden are not in the seed. The list still links
    // to /goalkeepers/gk-alfie-smith; the profile has to find them here.
    expect(findGoalkeeperById([row({ full_name: "Alfie Smith" })], "gk-alfie-smith")?.name).toBe(
      "Alfie Smith",
    );
    expect(
      findGoalkeeperById([row({ full_name: "Daniel Barden" })], "gk-daniel-barden")?.name,
    ).toBe("Daniel Barden");
  });

  it("returns undefined when the slug is unknown or the roster is missing", () => {
    expect(findGoalkeeperById([row()], "gk-nobody")).toBeUndefined();
    expect(findGoalkeeperById(null, "gk-harrison-male")).toBeUndefined();
  });
});
