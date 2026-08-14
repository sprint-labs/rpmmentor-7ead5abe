import { describe, expect, it } from "vitest";
import { parseSheetRows, identityForRowIndex, computeReportUid, baseReportUid } from "./schema";

function row(gk: string, team: string, opp: string, date: string): string[] {
  const r = new Array(15).fill("");
  r[0] = gk;
  r[1] = "Coach A";
  r[2] = team;
  r[3] = opp;
  r[4] = date;
  for (let i = 5; i <= 11; i++) r[i] = "3";
  r[12] = "3";
  r[13] = "Summary:\nGood game";
  r[14] = "League";
  return r;
}

describe("appended-row identity", () => {
  const rows = [
    row("Sam Keeper", "Club A", "Rovers", "2026-01-02"),
    row("Sam Keeper", "Club A", "Rovers", "2026-01-02"),
    row("Sam Keeper", "Club B", "Rovers", "2026-01-02"),
  ];
  const parsed = parseSheetRows(rows, 2);
  const base = computeReportUid({
    goalkeeper: "Sam Keeper",
    team: "Club A",
    opponent: "Rovers",
    match_date: "2026-01-02",
  });

  it("resolves the exact occurrence id for the appended sheet row", () => {
    expect(identityForRowIndex(parsed, 2)?.report_id).toBe(base);
    expect(identityForRowIndex(parsed, 3)?.report_id).toBe(`${base}~2`);
  });

  it("a confirmed duplicate does not collapse onto the base identity", () => {
    expect(identityForRowIndex(parsed, 3)?.report_id).not.toBe(
      identityForRowIndex(parsed, 2)?.report_id,
    );
    expect(baseReportUid(identityForRowIndex(parsed, 3)!.report_id)).toBe(base);
  });

  it("a different team keeps a distinct identity", () => {
    expect(identityForRowIndex(parsed, 4)?.report_id).not.toBe(base);
  });

  it("returns null when the row index is unknown — caller must report ambiguity", () => {
    expect(identityForRowIndex(parsed, -1)).toBeNull();
    expect(identityForRowIndex(parsed, 99)).toBeNull();
  });
});
