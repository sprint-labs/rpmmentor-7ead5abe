import { describe, expect, it } from "vitest";

import {
  competitionFromTitle,
  hasActiveEventFilters,
  matchesEventFilters,
  teamsFromTitle,
} from "./event-filters";

const FIXTURE = {
  title: "Stevenage v Sheffield Wednesday (EFL Championship)",
  goalkeeperName: "Joe Lumley",
};

describe("reading a fixture's title", () => {
  it("takes the competition out of the trailing brackets", () => {
    expect(competitionFromTitle(FIXTURE.title)).toBe("EFL Championship");
    expect(teamsFromTitle(FIXTURE.title)).toBe("Stevenage v Sheffield Wednesday");
  });

  it("copes with a title that names no competition", () => {
    expect(competitionFromTitle("Training ground visit")).toBe("");
    expect(teamsFromTitle("Training ground visit")).toBe("Training ground visit");
  });
});

describe("matchesEventFilters", () => {
  it("keeps everything when nothing has been typed", () => {
    expect(matchesEventFilters(FIXTURE, {})).toBe(true);
    expect(matchesEventFilters(FIXTURE, { team: "   " })).toBe(true);
    expect(hasActiveEventFilters({ team: "   " })).toBe(false);
    expect(hasActiveEventFilters({ team: "Stevenage" })).toBe(true);
  });

  it("narrows on a partial word, so the list moves as someone types", () => {
    for (const team of ["S", "Ste", "stevenage", "SHEFFIELD"]) {
      expect(matchesEventFilters(FIXTURE, { team })).toBe(true);
    }
    expect(matchesEventFilters(FIXTURE, { team: "Stockport" })).toBe(false);
  });

  it("matches either side of a fixture, since both are in the title", () => {
    expect(matchesEventFilters(FIXTURE, { team: "Sheffield Wednesday" })).toBe(true);
  });

  it("does not let a competition name match as a team", () => {
    // "Championship" is in the title, but only as the competition.
    expect(matchesEventFilters(FIXTURE, { team: "Championship" })).toBe(false);
    expect(matchesEventFilters(FIXTURE, { competition: "Championship" })).toBe(true);
  });

  it("matches the goalkeeper on their own field, not the title", () => {
    expect(matchesEventFilters(FIXTURE, { goalkeeper: "lumley" })).toBe(true);
    expect(matchesEventFilters(FIXTURE, { goalkeeper: "Bell" })).toBe(false);
    expect(matchesEventFilters({ title: "Joe Lumley catch-up" }, { goalkeeper: "Lumley" })).toBe(
      false,
    );
  });

  it("matches a calendar row that stores the player as gkName", () => {
    expect(
      matchesEventFilters({ title: FIXTURE.title, gkName: "Joe Lumley" }, { goalkeeper: "lumley" }),
    ).toBe(true);
    expect(
      matchesEventFilters({ title: FIXTURE.title, gkName: "Joe Lumley" }, { goalkeeper: "Bell" }),
    ).toBe(false);
  });

  it("ignores accents, so a plain keyboard finds every name", () => {
    expect(
      matchesEventFilters({ title: "x", goalkeeperName: "José Sá" }, { goalkeeper: "jose sa" }),
    ).toBe(true);
  });

  it("requires every filled field to match", () => {
    expect(
      matchesEventFilters(FIXTURE, { goalkeeper: "Lumley", team: "Stevenage", competition: "EFL" }),
    ).toBe(true);
    expect(
      matchesEventFilters(FIXTURE, { goalkeeper: "Lumley", team: "Stevenage", competition: "FA" }),
    ).toBe(false);
  });
});
