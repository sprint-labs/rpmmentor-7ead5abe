/**
 * Submission ledger state machine (pure logic — no I/O).
 *
 * The ledger is the durable record of every attempted app submission:
 *
 *   pending    → a submission key + fingerprint reservation is held; the Sheet
 *                append has not been confirmed. NOT a prior successful report.
 *   succeeded  → the Sheet append was confirmed AND the ledger row was updated.
 *                Only these rows count for the 10-minute / 24-hour duplicate
 *                windows.
 *   ambiguous  → the append may or may not have landed (lost response, 5xx,
 *                stale reservation). Needs a human decision; never retried
 *                automatically, and never presented as a prior success.
 *   failed     → the append definitively did not land. Safe to submit again.
 */
import { classifyDuplicateWindow, type DuplicateWindow } from "./duplicates";

export type LedgerStatus = "pending" | "succeeded" | "ambiguous" | "failed";

export interface LedgerRecord {
  id?: string | null;
  status: LedgerStatus;
  submitted_at?: string | null;
  reserved_at?: string | null;
  report_id?: string | null;
  sheet_row_index?: number | null;
}

/** A reservation older than this is treated as ambiguous, not in-progress. */
export const PENDING_EXPIRY_MS = 10 * 60 * 1000;

export type KeyDecision =
  | { action: "return_success"; report_id: string | null; row_index: number | null }
  | { action: "in_progress" }
  | { action: "ambiguous" }
  /** A previous attempt with this key definitively failed — reuse its row. */
  | { action: "reuse_failed" }
  | { action: "reserve" };


function ms(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(t) ? t : Number.NaN;
}

export function isPendingExpired(rec: LedgerRecord, now: number = Date.now()): boolean {
  if (rec.status !== "pending") return false;
  const t = ms(rec.reserved_at);
  if (!Number.isFinite(t)) return true;
  return now - t > PENDING_EXPIRY_MS;
}

/**
 * What to do when a submission arrives with an idempotency key we may have
 * seen before. A same-key retry must NEVER lead to a second append.
 */
export function decideForSubmissionKey(
  existing: LedgerRecord | null | undefined,
  now: number = Date.now(),
): KeyDecision {
  if (!existing) return { action: "reserve" };
  if (existing.status === "succeeded") {
    return {
      action: "return_success",
      report_id: existing.report_id ?? null,
      row_index: existing.sheet_row_index ?? null,
    };
  }
  if (existing.status === "pending") {
    return isPendingExpired(existing, now) ? { action: "ambiguous" } : { action: "in_progress" };
  }
  if (existing.status === "ambiguous") return { action: "ambiguous" };
  // failed — the append definitively didn't land, so the key can be reused.
  return { action: "reserve" };
}

/** Only confirmed successes count as a prior submission. */
export function countsAsPriorSuccess(rec: LedgerRecord): boolean {
  return rec.status === "succeeded" && Number.isFinite(ms(rec.submitted_at));
}

/**
 * Duplicate window for a fingerprint, considering ONLY confirmed successes.
 * Failed / pending / ambiguous records must never raise a duplicate warning.
 */
export function duplicateWindowForRecords(
  records: LedgerRecord[],
  now: number = Date.now(),
): { window: DuplicateWindow; report_id: string | null } {
  let best: { window: DuplicateWindow; report_id: string | null } = { window: null, report_id: null };
  for (const rec of records) {
    if (!countsAsPriorSuccess(rec)) continue;
    const win = classifyDuplicateWindow(ms(rec.submitted_at), now);
    if (!win) continue;
    if (win === "strong" || best.window === null) {
      best = { window: win, report_id: rec.report_id ?? null };
      if (win === "strong") break;
    }
  }
  return best;
}

/**
 * Callers that omit an idempotency key still get a durable reservation —
 * a server-generated key — rather than an invalid empty one. Keys supplied by
 * the form / offline queue are preserved exactly so retries stay stable.
 */
export function ensureSubmissionKey(key?: string | null): string {
  const k = (key ?? "").trim();
  if (k.length >= 8) return k;
  try {
    return `srv-${crypto.randomUUID()}`;
  } catch {
    return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
