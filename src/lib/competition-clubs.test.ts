import { describe, expect, it } from "vitest";
import {
  buildCompetitionClubIndex,
  clubsForCompetition,
  competitionKey,
  hasClubsForCompetition,
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
