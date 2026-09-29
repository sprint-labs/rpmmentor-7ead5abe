import { describe, expect, it } from "vitest";
import {
  compareMatchDatesNewestFirst,
  interactionsForGoalkeeper,
  reportsForGoalkeeper,
} from "@/lib/dossier/goalkeeper-dossier-sources";
import { goalkeepers } from "@/lib/mock-data";
import type { LoggedInteraction } from "@/lib/interactions/schema";
import { PILLAR_IDS, type MatchReportRow, type PillarId } from "@/lib/match-reports/schema";

const BEADLE = goalkeepers.find((gk) => gk.name === "James Beadle")!;

function report(report_id: string, goalkeeper: string, match_date: string | null): MatchReportRow {
  return {
    report_id,
    legacy_report_id: report_id,
    row_index: null,
    goalkeeper,
    coach: "A Coach",
    team: null,
    opponent: "Barnsley",
    competition: "EFL Championship",
    match_date,
    scores: Object.fromEntries(PILLAR_IDS.map((id) => [id, 4])) as Record<PillarId, number | null>,
    average: 4,
    comments: "",
  };
}

function interaction(id: string, overrides: Partial<LoggedInteraction> = {}): LoggedInteraction {
  return {
    id,
    gkSlug: "",
    goalkeeperName: "",
    playerId: null,
    mentorId: "mentor-1",
    mentorName: "A Mentor",
    interactionType: "Phone Call",
    club: "Birmingham City",
    occurredAt: "2026-09-01",
    notes: "",
    outcome: "On track",
    followUp: "",
    createdAt: "2026-09-01T12:00:00.000Z",
    matchReportId: null,
    calendarEventId: null,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

describe("compareMatchDatesNewestFirst", () => {
  it("sorts newest first and sinks undated reports to the bottom", () => {
    const dates = ["2026-01-01", null, "2026-09-01"];
    expect([...dates].sort(compareMatchDatesNewestFirst)).toEqual([
      "2026-09-01",
      "2026-01-01",
      null,
    ]);
  });
});

describe("reportsForGoalkeeper", () => {
  it("matches across the apostrophe the two tables disagree about", () => {
    const rows = [
      report("curly", "Rich O’Donnell", "2026-09-01"),
      report("other", "James Beadle", "2026-09-01"),
    ];

    expect(reportsForGoalkeeper(rows, "Rich O'Donnell").map((r) => r.report_id)).toEqual(["curly"]);
  });

  it("returns this goalkeeper's reports newest first", () => {
    const rows = [
      report("old", BEADLE.name, "2026-01-05"),
      report("undated", BEADLE.name, null),
      report("new", BEADLE.name, "2026-09-05"),
      report("someone-else", "Dan Bentley", "2026-09-09"),
    ];

    expect(reportsForGoalkeeper(rows, BEADLE.name).map((r) => r.report_id)).toEqual([
      "new",
      "old",
      "undated",
    ]);
  });

  it("answers with nothing rather than everything when handed no name", () => {
    expect(reportsForGoalkeeper([report("a", BEADLE.name, "2026-09-01")], "  ")).toEqual([]);
    expect(reportsForGoalkeeper(null, BEADLE.name)).toEqual([]);
  });
});

describe("interactionsForGoalkeeper", () => {
  it("matches on slug, linked player id or name, newest first", () => {
    const linkedPlayerId = "00000000-0000-4000-8000-000000000001";
    const rows = [
      interaction("by-name", { goalkeeperName: "James Beadle", occurredAt: "2026-08-01" }),
      interaction("by-slug", { gkSlug: BEADLE.id, occurredAt: "2026-09-20" }),
      interaction("by-player", { playerId: linkedPlayerId, occurredAt: "2026-09-10" }),
      interaction("someone-else", { goalkeeperName: "Dan Bentley", occurredAt: "2026-09-25" }),
    ];

    expect(interactionsForGoalkeeper(rows, BEADLE, linkedPlayerId).map((i) => i.id)).toEqual([
      "by-slug",
      "by-player",
      "by-name",
    ]);
  });

  it("tolerates a missing interactions cache", () => {
    expect(interactionsForGoalkeeper(undefined, BEADLE, null)).toEqual([]);
  });
});
