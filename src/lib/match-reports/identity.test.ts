import { describe, it, expect } from "vitest";
import {
  computeReportId,
  computeReportUid,
  baseReportUid,
  parseSheetRows,
  matchesReportId,
  COLUMN_INDEX,
} from "./schema";

function row(overrides: Partial<Record<keyof typeof COLUMN_INDEX, string>>): string[] {
  const r = new Array<string>(15).fill("");
  r[COLUMN_INDEX.goalkeeper] = overrides.goalkeeper ?? "Sam Beadle";
  r[COLUMN_INDEX.coach] = overrides.coach ?? "Luke Corrigan";
  r[COLUMN_INDEX.team] = overrides.team ?? "Wigan";
  r[COLUMN_INDEX.opponent] = overrides.opponent ?? "Blackburn";
  r[COLUMN_INDEX.match_date] = overrides.match_date ?? "04/01/2026";
  for (const id of ["protect_goal", "protect_space", "protect_air", "control_play", "change_play", "psych", "physical"] as const) {
    r[COLUMN_INDEX[id]] = "3";
  }
  r[COLUMN_INDEX.comments] = overrides.comments ?? "Summary:\nSolid.";
  return r;
}

describe("report identity", () => {
  it("separates same goalkeeper/opponent/date across different teams", () => {
    const a = computeReportUid({ goalkeeper: "Sam Beadle", team: "Wigan", opponent: "Blackburn", match_date: "2026-01-04" });
    const b = computeReportUid({ goalkeeper: "Sam Beadle", team: "Bolton", opponent: "Blackburn", match_date: "2026-01-04" });
    expect(a).not.toBe(b);
  });

  it("is stable across casing and spacing", () => {
    expect(
      computeReportUid({ goalkeeper: " sam  BEADLE", team: "wigan ", opponent: "Blackburn", match_date: "2026-01-04" }),
    ).toBe(computeReportUid({ goalkeeper: "Sam Beadle", team: "Wigan", opponent: "blackburn", match_date: "2026-01-04" }));
  });

  it("keeps historic detail URLs resolvable via the legacy id", () => {
    const [report] = parseSheetRows([row({})], 2);
    const legacy = computeReportId({
      goalkeeper: "Sam Beadle",
      match_date: report.match_date,
      opponent: "Blackburn",
    });
    expect(report.legacy_report_id).toBe(legacy);
    expect(matchesReportId(report, legacy)).toBe(true);
    expect(matchesReportId(report, report.report_id)).toBe(true);
  });

  it("gives confirmed duplicate rows distinct ids in sheet order", () => {
    const parsed = parseSheetRows([row({}), row({})], 2);
    expect(parsed[0].report_id).not.toBe(parsed[1].report_id);
    expect(parsed[1].report_id.endsWith("~2")).toBe(true);
    expect(baseReportUid(parsed[1].report_id)).toBe(parsed[0].report_id);
    // Both remain addressable by the shared base id.
    expect(matchesReportId(parsed[1], parsed[0].report_id)).toBe(true);
  });
});
