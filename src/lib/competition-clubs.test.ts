import { describe, expect, it } from "vitest";
import {
  buildCompetitionClubIndex,
  clubsForCompetition,
  competitionKey,
  hasClubsForCompetition,
  competitionsForClub,
  canonicalCompetition,
  hasCompetitionsForClub,
  EMPTY_CLUB_INDEX,
} from "./competition-clubs";

describe("competitionKey", () => {
  it("ignores case and collapses whitespace so one competition is one bucket", () => {
    expect(competitionKey("EFL Championship")).toBe(competitionKey("efl  championship "));
  });

  it("treats a missing competition as no key", () => {
    expect(competitionKey(null)).toBe("");
    expect(competitionKey("   ")).toBe("");
  });
});

describe("buildCompetitionClubIndex", () => {
  it("places a player's club in the competition their league names", () => {
    const index = buildCompetitionClubIndex({
      players: [
        { league: "EFL Championship", current_club: "Coventry City", parent_club: null },
        { league: "EFL League One", current_club: "Bolton Wanderers", parent_club: null },
      ],
    });

    expect(clubsForCompetition(index, "EFL Championship")).toEqual(["Coventry City"]);
    expect(clubsForCompetition(index, "EFL League One")).toEqual(["Bolton Wanderers"]);
  });

  it("counts a loanee's parent club as well as the club they are playing at", () => {
    const index = buildCompetitionClubIndex({
      players: [
        {
          league: "EFL League Two",
          current_club: "Barrow",
          parent_club: "Brighton & Hove Albion",
        },
      ],
    });

    expect(clubsForCompetition(index, "EFL League Two")).toEqual([
      "Barrow",
      "Brighton & Hove Albion",
    ]);
  });

  it("learns both sides of every fixture already reported on", () => {
    const index = buildCompetitionClubIndex({
      reports: [
        { competition: "EFL Championship", team: "Ipswich Town", opponent: "Blackburn Rovers" },
      ],
    });

    expect(clubsForCompetition(index, "EFL Championship")).toEqual([
      "Blackburn Rovers",
      "Ipswich Town",
    ]);
  });

  it("merges the roster and past reports into one alphabetical list", () => {
    const index = buildCompetitionClubIndex({
      players: [{ league: "EFL Championship", current_club: "Watford", parent_club: null }],
      reports: [{ competition: "EFL Championship", team: "Watford", opponent: "Derby County" }],
    });

    expect(clubsForCompetition(index, "EFL Championship")).toEqual(["Derby County", "Watford"]);
  });

  it("de-dupes clubs that differ only by case or spacing, keeping the first spelling", () => {
    const index = buildCompetitionClubIndex({
      players: [{ league: "National League", current_club: "Barnet", parent_club: null }],
      reports: [{ competition: "national league", team: "BARNET", opponent: "  Barnet  " }],
    });

    expect(clubsForCompetition(index, "National League")).toEqual(["Barnet"]);
    expect(index.competitions).toEqual(["National League"]);
  });

  it("skips blank names rather than offering an empty suggestion", () => {
    const index = buildCompetitionClubIndex({
      players: [{ league: "", current_club: "", parent_club: "   " }],
      reports: [{ competition: null, team: null, opponent: "" }],
    });

    expect(index).toEqual(EMPTY_CLUB_INDEX);
  });
});

describe("clubsForCompetition", () => {
  const index = buildCompetitionClubIndex({
    players: [
      { league: "EFL Championship", current_club: "Swansea City", parent_club: null },
      { league: "EFL League One", current_club: "Wigan Athletic", parent_club: null },
    ],
  });

  it("falls back to every known club for a cup, where anyone can meet anyone", () => {
    expect(clubsForCompetition(index, "FA Cup")).toEqual(["Swansea City", "Wigan Athletic"]);
    expect(hasClubsForCompetition(index, "FA Cup")).toBe(false);
  });

  it("falls back to every known club before a competition is chosen", () => {
    expect(clubsForCompetition(index, "")).toEqual(["Swansea City", "Wigan Athletic"]);
  });

  it("reports that a competition has its own list when it does", () => {
    expect(hasClubsForCompetition(index, "EFL Championship")).toBe(true);
  });

  it("returns nothing at all when the index is empty", () => {
    expect(clubsForCompetition(EMPTY_CLUB_INDEX, "EFL Championship")).toEqual([]);
  });
});

describe("competitionsForClub", () => {
  const index = buildCompetitionClubIndex({
    players: [
      { league: "EFL Championship", current_club: "Birmingham City", parent_club: null },
      { league: "Allsvenskan", current_club: "Hammarby", parent_club: null },
      { league: "EFL League One", current_club: "Bolton Wanderers", parent_club: null },
    ],
  });

  it("offers a club its own league, not every league on the roster", () => {
    const birmingham = competitionsForClub(index, "Birmingham City");

    expect(birmingham).toContain("EFL Championship");
    expect(birmingham).not.toContain("Allsvenskan");
    expect(hasCompetitionsForClub(index, "Birmingham City")).toBe(true);
  });

  it("adds the domestic cups that league enters, before any have been played", () => {
    expect(competitionsForClub(index, "Birmingham City")).toEqual([
      "Carabao Cup",
      "EFL Championship",
      "FA Cup",
    ]);
  });

  it("gives League One clubs the EFL Trophy that Championship clubs do not enter", () => {
    expect(competitionsForClub(index, "Bolton Wanderers")).toContain("EFL Trophy");
    expect(competitionsForClub(index, "Birmingham City")).not.toContain("EFL Trophy");
  });

  it("does not invent English cups for a club outside the English pyramid", () => {
    expect(competitionsForClub(index, "Hammarby")).toEqual(["Allsvenskan"]);
  });

  it("learns a cup a club has actually played in", () => {
    const withCupTie = buildCompetitionClubIndex({
      players: [{ league: "EFL Championship", current_club: "Birmingham City", parent_club: null }],
      reports: [{ competition: "Community Shield", team: "Birmingham City", opponent: "Arsenal" }],
    });

    expect(competitionsForClub(withCupTie, "Birmingham City")).toContain("Community Shield");
  });

  it("matches the club regardless of case or spacing", () => {
    expect(competitionsForClub(index, "  birmingham  city ")).toContain("EFL Championship");
  });

  it("falls back to every competition for a club it has never seen", () => {
    expect(competitionsForClub(index, "Hashtag United")).toEqual(index.competitions);
    expect(hasCompetitionsForClub(index, "Hashtag United")).toBe(false);
  });

  it("falls back to every competition before a club is chosen", () => {
    expect(competitionsForClub(index, "")).toEqual(index.competitions);
  });
});

describe("canonicalCompetition", () => {
  it("folds the short forms a spreadsheet collects onto one spelling", () => {
    expect(canonicalCompetition("championship")).toBe("EFL Championship");
    expect(canonicalCompetition("Sky Bet Championship")).toBe("EFL Championship");
    expect(canonicalCompetition("League Cup")).toBe("Carabao Cup");
    expect(canonicalCompetition("Papa John's Trophy")).toBe("EFL Trophy");
  });

  it("takes the catalogue's spelling when the name matches apart from case", () => {
    expect(canonicalCompetition("efl league one")).toBe("EFL League One");
    expect(canonicalCompetition("  fa cup  ")).toBe("FA Cup");
  });

  it("leaves an uncatalogued competition exactly as typed", () => {
    expect(canonicalCompetition("Kent Senior Cup")).toBe("Kent Senior Cup");
  });

  it("leaves genuinely ambiguous short forms alone", () => {
    // Could be the SPFL or the Premier League; guessing would be worse.
    expect(canonicalCompetition("Premiership")).toBe("Premiership");
  });

  it("treats a missing competition as empty", () => {
    expect(canonicalCompetition(null)).toBe("");
    expect(canonicalCompetition("   ")).toBe("");
  });
});

describe("folding duplicate competition spellings", () => {
  it("pools clubs that arrived under different spellings into one entry", () => {
    const index = buildCompetitionClubIndex({
      players: [{ league: "EFL Championship", current_club: "Birmingham City", parent_club: null }],
      reports: [{ competition: "championship", team: "Watford", opponent: "Derby County" }],
    });

    expect(index.competitions).toEqual(["EFL Championship"]);
    expect(clubsForCompetition(index, "championship")).toEqual([
      "Birmingham City",
      "Derby County",
      "Watford",
    ]);
  });

  it("does not let a competition alias rewrite a club's name", () => {
    const index = buildCompetitionClubIndex({
      players: [{ league: "EFL League One", current_club: "Bolton Wanderers", parent_club: null }],
    });

    expect(competitionsForClub(index, "bolton wanderers")).toContain("EFL League One");
    expect(index.allClubs).toEqual(["Bolton Wanderers"]);
  });
});
