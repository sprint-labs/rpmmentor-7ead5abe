import { describe, it, expect } from "vitest";
import {
  TRACKED_REPORT_TYPES,
  coverageWindow,
  missingReportTypes,
  shortLabel,
  isTrackedReportType,
  type ReportCoverageEntry,
} from "./report-coverage";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAYER_ID = "22222222-2222-4222-8222-222222222222";

function entry(over: Partial<ReportCoverageEntry> = {}): ReportCoverageEntry {
  return {
    type: "Coffee Catch Up",
    playerId: PLAYER_ID,
    gkSlug: null,
    goalkeeperName: "James Beadle",
    occurredOn: "2026-08-10",
    ...over,
  };
}

describe("tracked report types", () => {
  it("tracks the Match Report and the four interaction types", () => {
    expect(TRACKED_REPORT_TYPES).toEqual([
      "Match Report",
      "Live Match Observation",
      "Training Ground Visit",
      "Coffee Catch Up",
      "Phone Call",
    ]);
  });

  it("gives every tracked type a badge label", () => {
    expect(TRACKED_REPORT_TYPES.map(shortLabel)).toEqual(["MR", "LMO", "TGV", "CCU", "PC"]);
  });

  it("rejects a type it does not track", () => {
    expect(isTrackedReportType("Live Match Observation")).toBe(true);
    expect(isTrackedReportType("Physio Referral")).toBe(false);
  });
});

describe("missingReportTypes", () => {
  const gk = { playerId: PLAYER_ID, gkSlug: "gk-james-beadle", name: "James Beadle" };
  const window = { referenceDate: "2026-08-14", today: "2026-08-13" };

  it("reports everything missing when nothing has been logged", () => {
    expect(missingReportTypes([], gk, window)).toEqual([...TRACKED_REPORT_TYPES]);
  });

  it("stops reporting a type once it has been logged", () => {
    const missing = missingReportTypes([entry({ type: "Phone Call" })], gk, window);
    expect(missing).not.toContain("Phone Call");
    expect(missing).toContain("Coffee Catch Up");
  });

  it("returns nothing when all five are covered", () => {
    const coverage = TRACKED_REPORT_TYPES.map((type) => entry({ type }));
    expect(missingReportTypes(coverage, gk, window)).toEqual([]);
  });

  it("ignores rows for a different goalkeeper", () => {
    const coverage = [
      entry({ type: "Phone Call", playerId: OTHER_PLAYER_ID, goalkeeperName: "Somebody Else" }),
    ];
    expect(missingReportTypes(coverage, gk, window)).toContain("Phone Call");
  });

  it("trusts the player id over a matching name", () => {
    // Same name, different canonical player: two people, not one.
    const coverage = [entry({ type: "Phone Call", playerId: OTHER_PLAYER_ID })];
    expect(missingReportTypes(coverage, gk, window)).toContain("Phone Call");
  });

  it("matches a Match Report by name, since the canonical store has no player id", () => {
    const coverage = [
      entry({ type: "Match Report", playerId: null, goalkeeperName: "  james   BEADLE " }),
    ];
    expect(missingReportTypes(coverage, gk, window)).not.toContain("Match Report");
  });

  it("matches a legacy interaction by its slug when neither side has a player id", () => {
    const coverage = [
      entry({
        type: "Training Ground Visit",
        playerId: null,
        gkSlug: "gk-james-beadle",
        goalkeeperName: null,
      }),
    ];
    const legacyGk = { gkSlug: "gk-james-beadle" };
    expect(missingReportTypes(coverage, legacyGk, window)).not.toContain("Training Ground Visit");
  });

  it("ignores rows outside the window", () => {
    const tooOld = entry({ type: "Phone Call", occurredOn: "2026-07-13" });
    expect(missingReportTypes([tooOld], gk, window)).toContain("Phone Call");
  });

  it("counts a row on the first day of the window", () => {
    // Window ends at today (2026-08-13) because the event is in the future.
    const onBoundary = entry({ type: "Phone Call", occurredOn: "2026-07-14" });
    expect(missingReportTypes([onBoundary], gk, window)).not.toContain("Phone Call");
  });

  it("shows no badges when the event names no goalkeeper at all", () => {
    expect(missingReportTypes([entry()], { playerId: null, name: "" }, window)).toEqual([]);
  });

  it("ignores a row whose date is not a calendar date", () => {
    const malformed = entry({ type: "Phone Call", occurredOn: "" });
    expect(missingReportTypes([malformed], gk, window)).toContain("Phone Call");
  });
});

describe("a goalkeeper with real mixed coverage", () => {
  // Shaped like the live rows: interactions carry the canonical player id, the
  // Match Report carries only a name, and some interactions store an empty
  // string for the legacy slug rather than null.
  const BEADLE = "fe40ffaf-93e9-415d-b80f-b217497a5786";
  const coverage: ReportCoverageEntry[] = [
    {
      type: "Training Ground Visit",
      playerId: BEADLE,
      gkSlug: "gk-james-beadle",
      goalkeeperName: "James Beadle",
      occurredOn: "2026-08-11",
    },
    {
      type: "Live Match Observation",
      playerId: BEADLE,
      gkSlug: "",
      goalkeeperName: "James Beadle",
      occurredOn: "2026-08-06",
    },
    {
      type: "Match Report",
      playerId: null,
      gkSlug: null,
      goalkeeperName: "James Beadle",
      occurredOn: "2026-08-11",
    },
  ];

  it("reports only the two types nobody has logged", () => {
    const missing = missingReportTypes(
      coverage,
      { playerId: BEADLE, gkSlug: "gk-james-beadle", name: "James Beadle" },
      { referenceDate: "2026-08-14", today: "2026-08-13" },
    );
    expect(missing).toEqual(["Coffee Catch Up", "Phone Call"]);
  });

  it("still credits the Match Report for an event that only knows the name", () => {
    const missing = missingReportTypes(
      coverage,
      { name: "James Beadle" },
      {
        referenceDate: "2026-08-14",
        today: "2026-08-13",
      },
    );
    expect(missing).not.toContain("Match Report");
  });

  it("credits nothing to a different goalkeeper on the same day", () => {
    const missing = missingReportTypes(
      coverage,
      { playerId: OTHER_PLAYER_ID, name: "Alfie Whiteman" },
      { referenceDate: "2026-08-14", today: "2026-08-13" },
    );
    expect(missing).toEqual([...TRACKED_REPORT_TYPES]);
  });
});

describe("coverageWindow", () => {
  it("looks back 30 days from a past event", () => {
    expect(coverageWindow({ referenceDate: "2026-08-10", today: "2026-08-13" })).toEqual({
      start: "2026-07-11",
      end: "2026-08-10",
    });
  });

  it("never looks into the future for an event yet to happen", () => {
    // Anchoring on the event date would ask about dates that have not happened,
    // so a distant event would read as missing everything.
    expect(coverageWindow({ referenceDate: "2026-09-20", today: "2026-08-13" })).toEqual({
      start: "2026-07-14",
      end: "2026-08-13",
    });
  });

  it("crosses a month boundary without drifting a day", () => {
    expect(coverageWindow({ referenceDate: "2026-03-05", today: "2026-03-05" })).toEqual({
      start: "2026-02-03",
      end: "2026-03-05",
    });
  });

  it("honours a custom window length", () => {
    expect(
      coverageWindow({ referenceDate: "2026-08-13", today: "2026-08-13", windowDays: 7 }),
    ).toEqual({ start: "2026-08-06", end: "2026-08-13" });
  });
});
