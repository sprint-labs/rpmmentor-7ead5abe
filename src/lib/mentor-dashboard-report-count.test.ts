import { describe, expect, it } from "vitest";
import type { MatchReportRow } from "@/lib/match-reports/schema";
import {
  countCanonicalReportsForCoach,
  isMatchDateInPeriod,
  requireCoachIdentity,
  resolveCoachIdentity,
  selectCoachProfileForDashboard,
} from "./mentor-dashboard-report-count";

function report(overrides: Partial<MatchReportRow> = {}): MatchReportRow {
  return {
    report_id: "report-1",
    legacy_report_id: "legacy-report-1",
    row_index: 2,
    goalkeeper: "Sam Beadle",
    coach: "Dave Watson",
    team: "Wigan",
    opponent: "Blackburn",
    competition: "League One",
    match_date: "2026-01-10",
    scores: {
      protect_goal: 3,
      protect_space: 3,
      protect_air: 3,
      control_play: 3,
      change_play: 3,
      psych: 3,
      physical: 3,
    },
    average: 3,
    comments: "Solid.",
    ...overrides,
  };
}

function reportsRouteIncludes(matchDate: string | null, from: string, to: string) {
  if (!matchDate) return false;
  const timestamp = new Date(matchDate).getTime();
  return timestamp >= new Date(from).getTime() && timestamp <= new Date(to).getTime();
}

describe("resolveCoachIdentity", () => {
  it("uses the authenticated profile name before email, as report submission does", () => {
    expect(resolveCoachIdentity({ name: " Dave Watson ", email: "dave@example.com" })).toBe(
      "Dave Watson",
    );
  });

  it("falls back to the authenticated profile email", () => {
    expect(resolveCoachIdentity({ name: null, email: "dave@example.com" })).toBe(
      "dave@example.com",
    );
  });

  it("does not turn a missing report identity into a zero count", () => {
    expect(() => requireCoachIdentity({ name: null, email: null })).toThrow(
      "Match Report identity was unavailable",
    );
    expect(() => requireCoachIdentity(null)).toThrow("Match Report identity was unavailable");
  });
});

describe("selectCoachProfileForDashboard", () => {
  const caller = { name: "Luke Corrigan", email: "luke@example.com" };
  const effectiveMentor = { name: "Dave Watson", email: "dave@example.com" };

  it("uses the caller profile for a normal Mentor dashboard", () => {
    expect(selectCoachProfileForDashboard(caller, effectiveMentor, false)).toBe(caller);
  });

  it("uses the effective mentor profile for the Super Admin fallback view", () => {
    const selected = selectCoachProfileForDashboard(caller, effectiveMentor, true);
    expect(selected).toBe(effectiveMentor);
    expect(selected).not.toBe(caller);
  });
});

describe("canonical Match Report count", () => {
  const from = "2026-01-01T00:00:00.000Z";
  const to = "2026-01-15T23:59:59.999Z";

  it("counts only canonical rows stamped with the authenticated coach identity", () => {
    const reports = [
      report({ report_id: "dave", coach: "Dave Watson" }),
      report({ report_id: "luke", coach: "Luke Corrigan" }),
      report({ report_id: "mock", coach: "David Rouse" }),
    ];

    expect(countCanonicalReportsForCoach(reports, "Dave Watson", from, to)).toBe(1);
  });

  it("includes a newly read canonical row without a separate counter", () => {
    const initial = [report({ report_id: "first" })];
    const refreshed = [...initial, report({ report_id: "second", match_date: "2026-01-11" })];

    expect(countCanonicalReportsForCoach(initial, "Dave Watson", from, to)).toBe(1);
    expect(countCanonicalReportsForCoach(refreshed, "Dave Watson", from, to)).toBe(2);
  });

  it("uses the exact same inclusive predicate as the reports link", () => {
    const reports = [
      report({ report_id: "before", match_date: "2025-12-31" }),
      report({ report_id: "oldest", match_date: "2026-01-01" }),
      report({ report_id: "newest", match_date: "2026-01-15" }),
      report({ report_id: "after", match_date: "2026-01-16" }),
    ];
    const expected = reports.filter((item) => reportsRouteIncludes(item.match_date, from, to));

    expect(countCanonicalReportsForCoach(reports, "Dave Watson", from, to)).toBe(expected.length);
    expect(isMatchDateInPeriod("2026-01-01", from, to)).toBe(true);
    expect(isMatchDateInPeriod("2026-01-15", from, to)).toBe(true);
    expect(isMatchDateInPeriod("2025-12-31", from, to)).toBe(false);
  });

  it("keeps the count aligned with a browser west of UTC", () => {
    const westOfUtcFrom = "2025-12-31T05:00:00.000Z";
    const westOfUtcTo = "2026-01-15T04:59:59.999Z";
    const reports = [
      report({ report_id: "local-oldest", match_date: "2025-12-31" }),
      report({ report_id: "included", match_date: "2026-01-01" }),
      report({ report_id: "today", match_date: "2026-01-15" }),
    ];
    const expected = reports.filter((item) =>
      reportsRouteIncludes(item.match_date, westOfUtcFrom, westOfUtcTo),
    );

    expect(countCanonicalReportsForCoach(reports, "Dave Watson", westOfUtcFrom, westOfUtcTo)).toBe(
      expected.length,
    );
    expect(expected.map((item) => item.report_id)).toEqual(["included", "today"]);
  });

  it("counts the effective mentor, not the Super Admin, in the fallback view", () => {
    const caller = { name: "Luke Corrigan", email: "luke@example.com" };
    const effectiveMentor = { name: "Dave Watson", email: "dave@example.com" };
    const reports = [
      report({ report_id: "admin", coach: "Luke Corrigan" }),
      report({ report_id: "mentor", coach: "Dave Watson" }),
    ];

    const fallbackIdentity = resolveCoachIdentity(
      selectCoachProfileForDashboard(caller, effectiveMentor, true),
    );
    const callerIdentity = resolveCoachIdentity(
      selectCoachProfileForDashboard(caller, effectiveMentor, false),
    );

    expect(countCanonicalReportsForCoach(reports, fallbackIdentity, from, to)).toBe(1);
    expect(countCanonicalReportsForCoach(reports, callerIdentity, from, to)).toBe(1);
  });
});
