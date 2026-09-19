/**
 * These cases exist because the duty inbox used to answer from the frozen
 * `goalkeepers` seed array and a client-side recomputation over the empty
 * `interactions` seed. Two consequences were invisible from inside that
 * implementation and are asserted here:
 *
 *   - a goalkeeper who exists only in `public.players` could never be
 *     announced at all, and
 *   - every goalkeeper came out at the same level, so the snapshot diff had
 *     nothing real to compare.
 *
 * Every level below therefore comes from `public.player_duty_of_care` rows.
 */
import { describe, expect, it } from "vitest";
import {
  dutyLevelChanges,
  dutyLevelSnapshot,
  liveDutyEntries,
  seedFromLiveLevels,
} from "./duty-notifications";
import type { PlayerDutyOfCareRow } from "./duty-of-care.functions";

function player(full_name: string) {
  return { full_name };
}

function dutyRow(full_name: string, state: string): PlayerDutyOfCareRow {
  return {
    player_id: `00000000-0000-4000-8000-0000000000${full_name.length.toString().padStart(2, "0")}`,
    full_name,
    tier: "Tier 1",
    state: state as PlayerDutyOfCareRow["state"],
    rag_status: null,
    status_label: null,
    last_interaction_at: null,
    next_due_at: null,
    days_until_due: null,
    season_count: null,
    period_target: null,
    checkpoints_due: null,
    is_off_season: null,
  };
}

describe("liveDutyEntries", () => {
  it("reads the level from the view, keyed by the legacy profile slug", () => {
    // Neither of these names is in the seed roster. Under the old
    // implementation both were unreachable.
    const entries = liveDutyEntries(
      [player("Ada Newsigning"), player("Bo Latejoiner")],
      [dutyRow("Ada Newsigning", "red"), dutyRow("Bo Latejoiner", "green")],
    );

    expect(entries).toEqual([
      { gkId: "gk-ada-newsigning", gkName: "Ada Newsigning", level: "overdue" },
      { gkId: "gk-bo-latejoiner", gkName: "Bo Latejoiner", level: "up_to_date" },
    ]);
  });

  it("gives different goalkeepers different levels, as the view reports them", () => {
    const entries = liveDutyEntries(
      [player("Red Keeper"), player("Amber Keeper"), player("Green Keeper")],
      [
        dutyRow("Red Keeper", "red"),
        dutyRow("Amber Keeper", "amber"),
        dutyRow("Green Keeper", "complete"),
      ],
    );

    expect(entries.map((e) => e.level)).toEqual(["overdue", "due_soon", "up_to_date"]);
  });

  it("matches the view on name the way the roster does, apostrophes included", () => {
    const entries = liveDutyEntries(
      [player("Rich O'Donnell")],
      [dutyRow("rich o'donnell", "amber")],
    );

    expect(entries).toEqual([
      { gkId: "gk-rich-o-donnell", gkName: "Rich O'Donnell", level: "due_soon" },
    ]);
  });

  it("reports a goalkeeper the view does not cover as not_enough_data, not as missing", () => {
    const entries = liveDutyEntries([player("Uncovered Keeper")], []);

    expect(entries).toEqual([
      { gkId: "gk-uncovered-keeper", gkName: "Uncovered Keeper", level: "not_enough_data" },
    ]);
  });

  it("collapses two roster rows that share one slug into one goalkeeper", () => {
    const entries = liveDutyEntries(
      [player("Rich O'Donnell"), player("Rich O'Donnell")],
      [dutyRow("Rich O'Donnell", "red")],
    );

    expect(entries).toHaveLength(1);
  });

  it("returns nothing when the roster read has not answered", () => {
    expect(liveDutyEntries(undefined, [dutyRow("Ada Newsigning", "red")])).toEqual([]);
    expect(liveDutyEntries(null, null)).toEqual([]);
  });
});

describe("dutyLevelChanges", () => {
  const entries = liveDutyEntries([player("Ada Newsigning")], [dutyRow("Ada Newsigning", "red")]);

  it("announces a database-only goalkeeper whose level has moved", () => {
    const changes = dutyLevelChanges(
      entries,
      { "gk-ada-newsigning": "due_soon" },
      {},
      Date.parse("2026-09-19T10:00:00.000Z"),
    );

    expect(changes).toEqual([
      {
        id: "gk-ada-newsigning-1789812000000-overdue",
        gkId: "gk-ada-newsigning",
        gkName: "Ada Newsigning",
        from: "due_soon",
        to: "overdue",
        date: "2026-09-19T10:00:00.000Z",
        read: false,
      },
    ]);
  });

  it("stays silent for a goalkeeper the snapshot has never seen", () => {
    // A signing, or a first load. Recording them without an alert is what stops
    // a burst of notifications the first time the key space is populated.
    expect(dutyLevelChanges(entries, {}, {})).toEqual([]);
  });

  it("stays silent when the level has not moved", () => {
    expect(dutyLevelChanges(entries, { "gk-ada-newsigning": "overdue" }, {})).toEqual([]);
  });

  it("respects an acknowledgement of the level being moved to", () => {
    expect(
      dutyLevelChanges(
        entries,
        { "gk-ada-newsigning": "due_soon" },
        {
          "gk-ada-newsigning": "overdue",
        },
      ),
    ).toEqual([]);
  });

  it("announces an improvement as well as an escalation", () => {
    const improved = liveDutyEntries(
      [player("Ada Newsigning")],
      [dutyRow("Ada Newsigning", "green")],
    );

    expect(
      dutyLevelChanges(improved, { "gk-ada-newsigning": "overdue" }, {}).map((n) => [n.from, n.to]),
    ).toEqual([["overdue", "up_to_date"]]);
  });
});

describe("dutyLevelSnapshot", () => {
  it("records the live level for every goalkeeper, under the legacy slug", () => {
    const entries = liveDutyEntries(
      [player("Ada Newsigning"), player("Bo Latejoiner")],
      [dutyRow("Ada Newsigning", "red"), dutyRow("Bo Latejoiner", "amber")],
    );

    expect(dutyLevelSnapshot(entries)).toEqual({
      "gk-ada-newsigning": "overdue",
      "gk-bo-latejoiner": "due_soon",
    });
  });
});

describe("seedFromLiveLevels", () => {
  it("seeds only the goalkeepers who currently need attention", () => {
    const entries = liveDutyEntries(
      [player("Red Keeper"), player("Green Keeper"), player("Fourth Tier")],
      [
        dutyRow("Red Keeper", "red"),
        dutyRow("Green Keeper", "complete"),
        dutyRow("Fourth Tier", "not_required"),
      ],
    );

    expect(seedFromLiveLevels(entries).map((n) => [n.gkId, n.to])).toEqual([
      ["gk-red-keeper", "overdue"],
    ]);
  });

  it("caps the starting inbox so a large roster cannot flood it", () => {
    const names = Array.from({ length: 40 }, (_, i) => `Keeper Number${i}`);
    const entries = liveDutyEntries(
      names.map(player),
      names.map((name) => dutyRow(name, "red")),
    );

    expect(seedFromLiveLevels(entries)).toHaveLength(24);
  });
});
