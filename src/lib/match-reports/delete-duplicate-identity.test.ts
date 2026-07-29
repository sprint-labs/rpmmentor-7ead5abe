import { describe, expect, it } from "vitest";
import {
  rawRowSignature,
  countSignature,
  classifyDeleteReadback,
  countBaseGroup,
  hasDuplicateIdentityGroup,
} from "./delete-verify";
import { parseSheetRows, baseReportUid, COLUMN_INDEX } from "./schema";

/**
 * Two rows with the SAME match key (goalkeeper/team/opponent/date) but DIFFERENT
 * comments and scores. Raw content differs, so raw-signature counting would say
 * "no duplicates", yet identities are base / ~2 and reindex on delete.
 */
function row(comment: string, score: string): string[] {
  const r = new Array(15).fill("");
  r[COLUMN_INDEX.date] = "2026-03-01";
  r[COLUMN_INDEX.coach] = "Luke Corrigan";
  r[COLUMN_INDEX.goalkeeper] = "Sam Keeper";
  r[COLUMN_INDEX.team] = "Rovers";
  r[COLUMN_INDEX.opponent] = "United";
  r[COLUMN_INDEX.comments] = comment;
  r[COLUMN_INDEX.competition] = "League";
  const first = PILLAR_START;
  r[first] = score;
  return r;
}
// pillar scores live between opponent and comments; pick a known numeric column
const PILLAR_START = COLUMN_INDEX.shot_stopping ?? 5;

describe("duplicate-delete identity safety (differing content, same match key)", () => {
  const rowA = row("Strong first half, commanding on crosses throughout the game.", "4");
  const rowB = row("Second viewing: distribution improved, positioning still narrow.", "3");
  const rows = [rowA, rowB];
  const parsed = parseSheetRows(rows, 2);

  it("gives the two rows base and ~2 identities despite different content", () => {
    expect(parsed).toHaveLength(2);
    expect(parsed[1].report_id).toBe(`${parsed[0].report_id}~2`);
    expect(baseReportUid(parsed[1].report_id)).toBe(parsed[0].report_id);
  });

  it("raw-signature counting would WRONGLY report no duplicates", () => {
    expect(countSignature(rows, rawRowSignature(rowA))).toBe(1);
  });

  it("identity-based counting detects the duplicate base group", () => {
    expect(countBaseGroup(parsed, baseReportUid(parsed[0].report_id), baseReportUid)).toBe(2);
    expect(hasDuplicateIdentityGroup(parsed, parsed[0].report_id, baseReportUid)).toBe(true);
    expect(hasDuplicateIdentityGroup(parsed, parsed[1].report_id, baseReportUid)).toBe(true);
  });

  it("ambiguous delete of the first row is proven applied by raw content", () => {
    const signature = rawRowSignature(rowA);
    const countBefore = countSignature(rows, signature);
    const verdict = classifyDeleteReadback({
      signature,
      countBefore,
      rowsAfter: [rowB], // sheet after the delete landed
    });
    expect(verdict.outcome).toBe("applied");
  });

  it("the survivor reindexes to the base id, so identity cleanup must be skipped", () => {
    const before = parsed[0].report_id;
    const after = parseSheetRows([rowB], 2);
    // rowB previously held `~2`; it now owns the base id.
    expect(parsed[1].report_id).not.toBe(before);
    expect(after[0].report_id).toBe(before);

    // Handler logic: duplicate base group -> terminal, no identity cleanup.
    const terminal = hasDuplicateIdentityGroup(parsed, before, baseReportUid);
    expect(terminal).toBe(true);
  });

  it("a genuinely unique row keeps normal cleanup behaviour", () => {
    const solo = parseSheetRows([rowA], 2);
    expect(hasDuplicateIdentityGroup(solo, solo[0].report_id, baseReportUid)).toBe(false);
  });
});
