import { describe, it, expect } from "vitest";
import {
  decideForSubmissionKey,
  duplicateWindowForRecords,
  ensureSubmissionKey,
  isPendingExpired,
  PENDING_EXPIRY_MS,
  type LedgerRecord,
} from "./ledger";

const NOW = Date.parse("2026-01-04T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("decideForSubmissionKey — lost response never appends twice", () => {
  it("reserves when the key is unknown", () => {
    expect(decideForSubmissionKey(null, NOW)).toEqual({ action: "reserve" });
  });

  it("returns the original result for a succeeded key instead of appending again", () => {
    const rec: LedgerRecord = {
      status: "succeeded",
      submitted_at: iso(NOW - 1000),
      report_id: "mr2_abc",
      sheet_row_index: 42,
    };
    expect(decideForSubmissionKey(rec, NOW)).toEqual({
      action: "return_success",
      report_id: "mr2_abc",
      row_index: 42,
    });
  });

  it("reports in-progress for a fresh pending reservation", () => {
    const rec: LedgerRecord = { status: "pending", reserved_at: iso(NOW - 5_000) };
    expect(decideForSubmissionKey(rec, NOW)).toEqual({ action: "in_progress" });
  });

  it("reports ambiguous for a stale pending reservation", () => {
    const rec: LedgerRecord = { status: "pending", reserved_at: iso(NOW - PENDING_EXPIRY_MS - 1) };
    expect(decideForSubmissionKey(rec, NOW)).toEqual({ action: "ambiguous" });
    expect(isPendingExpired(rec, NOW)).toBe(true);
  });

  it("keeps an ambiguous key ambiguous — never auto-retried", () => {
    expect(decideForSubmissionKey({ status: "ambiguous" }, NOW)).toEqual({ action: "ambiguous" });
  });

  it("lets a definitively failed key be reused", () => {
    expect(decideForSubmissionKey({ status: "failed" }, NOW)).toEqual({ action: "reserve" });
  });
});

describe("duplicateWindowForRecords — only confirmed successes count", () => {
  it("flags a confirmed success inside 10 minutes as strong", () => {
    const res = duplicateWindowForRecords(
      [{ status: "succeeded", submitted_at: iso(NOW - 60_000), report_id: "mr2_x" }],
      NOW,
    );
    expect(res).toEqual({ window: "strong", report_id: "mr2_x" });
  });

  it("flags a confirmed success inside 24 hours as soft", () => {
    const res = duplicateWindowForRecords(
      [{ status: "succeeded", submitted_at: iso(NOW - 6 * 3600_000), report_id: "mr2_x" }],
      NOW,
    );
    expect(res.window).toBe("soft");
  });

  it("ignores pending, ambiguous and failed records", () => {
    const recent = iso(NOW - 30_000);
    const res = duplicateWindowForRecords(
      [
        { status: "pending", submitted_at: recent, reserved_at: recent },
        { status: "ambiguous", submitted_at: recent },
        { status: "failed", submitted_at: recent },
      ],
      NOW,
    );
    expect(res).toEqual({ window: null, report_id: null });
  });
});

describe("ensureSubmissionKey", () => {
  it("preserves a stable client key", () => {
    expect(ensureSubmissionKey("client-key-123456")).toBe("client-key-123456");
  });

  it("generates a server key when the caller omits one", () => {
    expect(ensureSubmissionKey(undefined)).toMatch(/^srv-/);
    expect(ensureSubmissionKey("")).toMatch(/^srv-/);
    expect(ensureSubmissionKey("   ")).toMatch(/^srv-/);
  });
});
