import { describe, expect, it } from "vitest";
import { goalkeeperForm, pillarStandouts } from "@/lib/match-reports/goalkeeper-form";
import type { MatchReportRow } from "@/lib/match-reports/schema";

function report(
  id: string,
  date: string | null,
  score: number | null,
  overrides: Partial<MatchReportRow> = {},
): MatchReportRow {
  return {
    report_id: id,
    legacy_report_id: "legacy",
    row_index: 1,
    goalkeeper: "Max O'Leary",
    coach: "Ben Beson",
    team: "Bristol City",
    opponent: "Hull City",
    competition: "EFL Championship",
    match_date: date,
    scores: {
      protect_goal: score,
      protect_space: score,
      protect_air: score,
      control_play: score,
      change_play: score,
      psych: score,
      physical: score,
    },
    average: score,
    comments: "",
    ...overrides,
  };
}

describe("goalkeeperForm", () => {
  it("reads a report against the goalkeeper's other reports only", () => {
    const current = report("r3", "2026-09-20", 5);
    const all = [
      report("r1", "2026-09-01", 3),
      // Curly apostrophe: the same goalkeeper to a person, so the same record.
      report("r2", "2026-09-10", 4, { goalkeeper: "Max O’Leary" }),
      current,
      report("x1", "2026-09-15", 1, { goalkeeper: "Someone Else" }),
    ];

    const form = goalkeeperForm(all, current);

    expect(form.reports.map((r) => r.report_id)).toEqual(["r3", "r2", "r1"]);
    expect(form.overallAverage).toBe(4);
    expect(form.averageBaseline).toBe(3.5);
    expect(form.pillarBaseline.protect_air).toBe(3.5);
    expect(form.baselineCount).toBe(2);
    // Oldest first, ending on this match.
    expect(form.form.map((r) => r.report_id)).toEqual(["r1", "r2", "r3"]);
  });

  it("leaves out scores outside 1–5 and missing averages", () => {
    const current = report("r1", "2026-09-20", 4);
    const form = goalkeeperForm(
      [current, report("r2", "2026-09-10", null), report("r3", "2026-09-05", 0)],
      current,
    );
    expect(form.overallAverage).toBe(4);
    expect(form.averageBaseline).toBeNull();
    expect(form.pillarBaseline.protect_goal).toBeNull();
  });

  it("shows form up to this match, not after it", () => {
    const reports = Array.from({ length: 9 }, (_, i) =>
      report(`r${i}`, `2026-08-${String(10 + i).padStart(2, "0")}`, 3),
    );
    const current = reports[6]!;
    const form = goalkeeperForm(reports, current);
    expect(form.form.map((r) => r.report_id)).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"]);
  });

  it("still counts a report the list has not caught up with", () => {
    const current = report("fresh", "2026-09-22", 4);
    const form = goalkeeperForm([report("r1", "2026-09-01", 2)], current);
    expect(form.reports.map((r) => r.report_id)).toEqual(["fresh", "r1"]);
    expect(form.averageBaseline).toBe(2);
  });
});

describe("pillarStandouts", () => {
  it("names the best and the weakest scored pillar", () => {
    const { strongest, focus } = pillarStandouts({
      protect_goal: 4,
      protect_space: 5,
      protect_air: 2,
      control_play: 3,
      change_play: 5,
      psych: null,
      physical: 2,
    });
    expect(strongest).toEqual({ id: "protect_space", score: 5 });
    expect(focus).toEqual({ id: "protect_air", score: 2 });
  });

  it("has no weakest pillar when every score is level", () => {
    const { strongest, focus } = pillarStandouts(report("r", null, 3).scores);
    expect(strongest?.score).toBe(3);
    expect(focus).toBeNull();
  });

  it("has nothing to say about an unscored report", () => {
    expect(pillarStandouts(report("r", null, null).scores)).toEqual({
      strongest: null,
      focus: null,
    });
  });
});
