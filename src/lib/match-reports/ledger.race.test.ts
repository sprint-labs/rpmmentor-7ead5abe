import { describe, expect, it } from "vitest";
import {
  decideForSubmissionKey,
  openFingerprintBlock,
  classifyLedgerWriteError,
  duplicateWindowForRecords,
  type LedgerRecord,
} from "./ledger";

const NOW = Date.parse("2026-01-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("post-reservation race", () => {
  it("re-check sees a success that landed after the precheck", () => {
    const mine: LedgerRecord = { id: "mine", status: "pending", reserved_at: ago(1000) };
    const theirs: LedgerRecord = {
      id: "theirs",
      status: "succeeded",
      submitted_at: ago(60_000),
      report_id: "mr2_a",
    };
    // precheck (only pending 'theirs') -> nothing blocking, no duplicate
    expect(
      duplicateWindowForRecords([{ ...theirs, status: "pending", submitted_at: null }], NOW).window,
    ).toBeNull();
    // post-reservation re-check, excluding our own reservation
    const dup = duplicateWindowForRecords(
      [mine, theirs].filter((r) => r.id !== "mine"),
      NOW,
    );
    expect(dup.window).toBe("strong");
    expect(dup.report_id).toBe("mr2_a");
    expect(openFingerprintBlock([mine, theirs], NOW, "mine")).toBeNull();
  });
});

describe("cross-key ambiguity block", () => {
  it("an unresolved ambiguous row blocks a brand-new key", () => {
    const rows: LedgerRecord[] = [{ id: "old", status: "ambiguous", submitted_at: ago(5000) }];
    expect(openFingerprintBlock(rows, NOW)).toBe("ambiguous");
    // and it is NOT a confirmed duplicate
    expect(duplicateWindowForRecords(rows, NOW).window).toBeNull();
  });

  it("an expired pending row degrades to ambiguous, not in-progress", () => {
    const rows: LedgerRecord[] = [
      { id: "stale", status: "pending", reserved_at: ago(20 * 60_000) },
    ];
    expect(openFingerprintBlock(rows, NOW)).toBe("ambiguous");
  });

  it("a fresh pending row from another key is in-progress", () => {
    const rows: LedgerRecord[] = [{ id: "live", status: "pending", reserved_at: ago(2000) }];
    expect(openFingerprintBlock(rows, NOW)).toBe("in_progress");
  });

  it("failed rows never block a later retry", () => {
    const rows: LedgerRecord[] = [{ id: "dead", status: "failed", submitted_at: ago(1000) }];
    expect(openFingerprintBlock(rows, NOW)).toBeNull();
  });
});

describe("same-key failed retry", () => {
  it("reuses the failed reservation instead of inserting a conflicting row", () => {
    expect(decideForSubmissionKey({ id: "x", status: "failed" }, NOW)).toEqual({
      action: "reuse_failed",
    });
  });
  it("a fresh key reserves", () => {
    expect(decideForSubmissionKey(null, NOW)).toEqual({ action: "reserve" });
  });
});

describe("ledger write error classification", () => {
  it("unique violation is a conflict", () => {
    expect(classifyLedgerWriteError({ code: "23505" })).toBe("conflict");
    expect(
      classifyLedgerWriteError({ message: "duplicate key value violates unique constraint" }),
    ).toBe("conflict");
  });
  it("any other failure is an error, never in-progress", () => {
    expect(classifyLedgerWriteError({ code: "08006", message: "connection failure" })).toBe(
      "error",
    );
    expect(classifyLedgerWriteError(new Error("boom"))).toBe("error");
  });
});
