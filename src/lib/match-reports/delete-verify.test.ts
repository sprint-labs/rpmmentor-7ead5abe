import { describe, it, expect } from "vitest";
import { rawRowSignature, countSignature, classifyDeleteReadback } from "./delete-verify";
import { parseSheetRows } from "./schema";

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

const A = row("Sam Keeper", "Club A", "Rovers", "2026-01-02"); // duplicated 3x
const B = row("Ana Keeper", "Club B", "City", "2026-01-05");

describe("content-based delete verification", () => {
  it("signature ignores case/whitespace but not content", () => {
    const messy = A.map((c) => `  ${c.toUpperCase()}  `);
    expect(rawRowSignature(messy)).toBe(rawRowSignature(A));
    expect(rawRowSignature(B)).not.toBe(rawRowSignature(A));
  });

  it("occurrence ids reindex after a duplicate delete — identity check is unsafe", () => {
    const before = parseSheetRows([A, A, A, B], 2);
    const after = parseSheetRows([A, A, B], 2); // base row deleted
    // The base id is STILL present after a successful delete.
    expect(after.some((r) => r.report_id === before[0].report_id)).toBe(true);
    // Content counting tells the truth.
    const sig = rawRowSignature(A);
    expect(countSignature([A, A, A, B], sig)).toBe(3);
    expect(countSignature([A, A, B], sig)).toBe(2);
  });

  it("a verified decrease for duplicate content is 'applied', not an error", () => {
    const sig = rawRowSignature(A);
    expect(
      classifyDeleteReadback({ signature: sig, countBefore: 3, rowsAfter: [A, A, B] }),
    ).toEqual({ outcome: "applied", duplicatesRemaining: 2 });
  });

  it("unchanged count means nothing was deleted — retry is safe", () => {
    const sig = rawRowSignature(A);
    expect(
      classifyDeleteReadback({ signature: sig, countBefore: 3, rowsAfter: [A, A, A, B] }),
    ).toEqual({ outcome: "not_applied" });
  });

  it("a failed read-back is unknown — never auto-retry", () => {
    const v = classifyDeleteReadback({
      signature: rawRowSignature(A),
      countBefore: 1,
      rowsAfter: null,
    });
    expect(v.outcome).toBe("unknown");
  });

  it("more than one row disappearing is unknown, not applied", () => {
    const v = classifyDeleteReadback({
      signature: rawRowSignature(A),
      countBefore: 3,
      rowsAfter: [A, B],
    });
    expect(v.outcome).toBe("unknown");
  });

  it("unique-row delete verifies cleanly", () => {
    const sig = rawRowSignature(B);
    expect(
      classifyDeleteReadback({ signature: sig, countBefore: 1, rowsAfter: [A, A, A] }),
    ).toEqual({ outcome: "applied", duplicatesRemaining: 0 });
  });
});
