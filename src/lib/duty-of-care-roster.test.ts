import { describe, expect, it } from "vitest";
import {
  buildRosterDutyIndex,
  countDutyRows,
  countRosterDuty,
  rosterDutyFor,
} from "./duty-of-care-roster";
import type { PlayerDutyOfCareRow } from "./duty-of-care.functions";

function row(over: Partial<PlayerDutyOfCareRow>): PlayerDutyOfCareRow {
  return {
    player_id: "00000000-0000-0000-0000-000000000000",
    full_name: "Max Crocombe",
    tier: "Tier 1",
    state: "red",
    rag_status: "red",
    status_label: "Overdue",
    last_interaction_at: "2026-08-25",
    next_due_at: "2026-09-09",
    days_until_due: -9,
    season_count: 2,
    period_target: 2,
    checkpoints_due: 3,
    is_off_season: false,
    ...over,
  };
}

/** Fixed clock so the day maths cannot drift with the calendar. */
const NOW = Date.parse("2026-09-19T12:00:00Z");

describe("rosterDutyFor", () => {
  it("gives the list the same answer the profile shows", () => {
    const index = buildRosterDutyIndex([row({})], NOW);

    expect(rosterDutyFor(index, "Max Crocombe")).toEqual({
      level: "overdue",
      label: "Overdue",
      // 2026-08-25 to 2026-09-19.
      days: 25,
    });
  });

  it("counts days from the view's own last contact, not from interactions", () => {
    const index = buildRosterDutyIndex([row({ last_interaction_at: "2026-09-09" })], NOW);

    expect(rosterDutyFor(index, "Max Crocombe").days).toBe(10);
  });

  it("reports zero days when the view records no contact at all", () => {
    const index = buildRosterDutyIndex([row({ last_interaction_at: null })], NOW);

    expect(rosterDutyFor(index, "Max Crocombe").days).toBe(0);
  });

  it("matches the goalkeeper regardless of case or spacing", () => {
    const index = buildRosterDutyIndex([row({})]);

    expect(rosterDutyFor(index, "  max   crocombe ").level).toBe("overdue");
  });

  it("maps each database state onto the roster's vocabulary", () => {
    const index = buildRosterDutyIndex([
      row({ full_name: "Red", state: "red", status_label: "Overdue" }),
      row({ full_name: "Amber", state: "amber", status_label: "Due soon" }),
      row({ full_name: "Green", state: "green", status_label: "Up to date" }),
      row({ full_name: "Complete", state: "complete", status_label: "Season complete" }),
      row({ full_name: "Exempt", state: "not_required", status_label: "Not required" }),
      row({ full_name: "Summer", state: "off_season", status_label: "Off season" }),
      row({ full_name: "Unknown", state: "no_data", status_label: null }),
    ]);

    expect(rosterDutyFor(index, "Red").level).toBe("overdue");
    expect(rosterDutyFor(index, "Amber").level).toBe("due_soon");
    expect(rosterDutyFor(index, "Green").level).toBe("up_to_date");
    expect(rosterDutyFor(index, "Complete").level).toBe("up_to_date");
    expect(rosterDutyFor(index, "Exempt").level).toBe("not_required");
    expect(rosterDutyFor(index, "Summer").level).toBe("not_required");
    expect(rosterDutyFor(index, "Unknown").level).toBe("not_enough_data");
  });

  it("keeps the database's own wording when it has one", () => {
    const index = buildRosterDutyIndex([
      row({ full_name: "Complete", state: "complete", status_label: "Season complete" }),
    ]);

    expect(rosterDutyFor(index, "Complete").label).toBe("Season complete");
  });

  it("falls back to the level's label when the view has no wording", () => {
    const index = buildRosterDutyIndex([row({ state: "amber", status_label: "  " })]);

    expect(rosterDutyFor(index, "Max Crocombe").label).toBe("Due soon");
  });

  it("says loading rather than claiming there is not enough data", () => {
    expect(rosterDutyFor(new Map(), "Max Crocombe", { pending: true })).toEqual({
      level: "not_enough_data",
      label: "Loading…",
      days: 0,
    });
  });

  it("says unavailable when the read failed", () => {
    expect(rosterDutyFor(new Map(), "Max Crocombe", { error: true }).label).toBe("Unavailable");
  });

  it("reports not enough data only once the read has landed without a row", () => {
    expect(rosterDutyFor(new Map(), "Max Crocombe").label).toBe("Not enough data");
  });

  it("skips rows with no name rather than indexing an empty key", () => {
    const index = buildRosterDutyIndex([row({ full_name: null }), row({ full_name: "  " })]);

    expect(index.size).toBe(0);
  });
});

describe("countRosterDuty", () => {
  it("counts the roster by level for the filter chips", () => {
    const index = buildRosterDutyIndex([
      row({ full_name: "A", state: "red" }),
      row({ full_name: "B", state: "red" }),
      row({ full_name: "C", state: "amber" }),
      row({ full_name: "D", state: "not_required" }),
    ]);

    const counts = countRosterDuty(index, ["A", "B", "C", "D", "Nobody"]);

    expect(counts).toEqual({
      total: 5,
      overdue: 2,
      due_soon: 1,
      up_to_date: 0,
      not_required: 1,
      not_enough_data: 1,
    });
  });
});

describe("countDutyRows", () => {
  // The dashboard headline used to recompute duty on the client from logged
  // interactions keyed by legacy slug, and undercounted: the card read 10 while
  // the roster list read 15. Counting the view's own rows needs no roster to
  // match names against, so there is nothing left to disagree about.
  it("counts the view's own rows, with no roster to match against", () => {
    const counts = countDutyRows([
      row({ full_name: "A", state: "red" }),
      row({ full_name: "B", state: "red" }),
      row({ full_name: "C", state: "amber" }),
      row({ full_name: "D", state: "green" }),
      row({ full_name: "E", state: "not_required" }),
      row({ full_name: "F", state: "no_data" }),
    ]);

    expect(counts).toEqual({
      total: 6,
      overdue: 2,
      due_soon: 1,
      up_to_date: 1,
      not_required: 1,
      not_enough_data: 1,
    });
  });

  it("counts a row the roster has never heard of", () => {
    // `countRosterDuty` can only count goalkeepers whose names it was given.
    // This one answers for everyone the view covers, which is the point.
    const rows = [row({ full_name: "Someone Not In The Roster", state: "red" })];

    expect(countDutyRows(rows).overdue).toBe(1);
    expect(countRosterDuty(buildRosterDutyIndex(rows), []).overdue).toBe(0);
  });

  it("returns zeroes rather than throwing on a malformed response", () => {
    expect(countDutyRows(null).total).toBe(0);
    expect(countDutyRows(undefined).overdue).toBe(0);
  });
});
