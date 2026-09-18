import { describe, expect, it } from "vitest";
import { buildRosterDutyIndex, countRosterDuty, rosterDutyFor } from "./duty-of-care-roster";
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

describe("rosterDutyFor", () => {
  it("gives the list the same answer the profile shows", () => {
    const index = buildRosterDutyIndex([row({})]);

    expect(rosterDutyFor(index, "Max Crocombe")).toEqual({
      level: "overdue",
      label: "Overdue",
    });
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
