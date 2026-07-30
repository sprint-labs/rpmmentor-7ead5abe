/**
 * Manual "Re-sync now" planner (pure logic — no I/O).
 *
 * Scope: ONLY ledger rows with status `failed`. A `failed` reservation means
 * the Sheet append definitively did not land, so replaying it cannot create a
 * second row — and the replay itself is still idempotent via `submission_key`.
 *
 * `pending` (in flight), `ambiguous` (unknown outcome) and `succeeded` rows are
 * never touched: retrying those could double-write the sheet.
 *
 * Safety net: before declaring a failed reservation retryable we reconcile it
 * against what the sheet actually contains. If the sheet holds a row for that
 * fixture identity that no `succeeded` ledger row accounts for, we cannot prove
 * the failed attempt didn't land after all — that row is held for human review
 * (reclassified `ambiguous`) instead of retried.
 */
import { baseReportUid, computeReportUid } from "./schema";

export interface ResyncLedgerRow {
  id: string;
  status: string;
  submission_key: string;
  goalkeeper: string;
  team: string | null;
  opponent: string | null;
  match_date: string | null;
  report_id: string | null;
}

export type ResyncOutcome = "retry_ready" | "hold_for_review";

export interface ResyncDecision {
  id: string;
  submission_key: string;
  base_uid: string;
  outcome: ResyncOutcome;
  reason: string;
  label: string;
}

/** Fixture identity for a ledger row, independent of `~2`/`~3` suffixes. */
export function baseUidForLedgerRow(row: ResyncLedgerRow): string {
  if (row.report_id) return baseReportUid(row.report_id);
  return computeReportUid({
    goalkeeper: row.goalkeeper,
    team: row.team ?? "",
    opponent: row.opponent ?? "",
    match_date: row.match_date ?? "",
  });
}

function labelFor(row: ResyncLedgerRow): string {
  const parts = [row.goalkeeper, row.opponent ? `vs ${row.opponent}` : null, row.match_date]
    .filter(Boolean);
  return parts.join(" · ") || row.submission_key;
}

/**
 * @param rows        every recent ledger row for the caller's scope (all statuses)
 * @param sheetReportIds report ids currently parsed from the sheet
 */
export function planResync(
  rows: ResyncLedgerRow[],
  sheetReportIds: string[],
): ResyncDecision[] {
  const sheetCount = new Map<string, number>();
  for (const id of sheetReportIds) {
    const base = baseReportUid(id);
    sheetCount.set(base, (sheetCount.get(base) ?? 0) + 1);
  }

  // Rows already explained by a confirmed success (or an unresolved attempt
  // that a human still owns) must not be "claimed" by a failed reservation.
  const accounted = new Map<string, number>();
  for (const r of rows) {
    if (r.status !== "succeeded" && r.status !== "ambiguous" && r.status !== "pending") continue;
    const base = baseUidForLedgerRow(r);
    accounted.set(base, (accounted.get(base) ?? 0) + 1);
  }

  const out: ResyncDecision[] = [];
  for (const row of rows) {
    if (row.status !== "failed") continue;
    const base = baseUidForLedgerRow(row);
    const unaccounted = (sheetCount.get(base) ?? 0) - (accounted.get(base) ?? 0);
    if (unaccounted > 0) {
      // Consume it so a second failed row for the same fixture isn't held by
      // the same unexplained sheet row.
      accounted.set(base, (accounted.get(base) ?? 0) + 1);
      out.push({
        id: row.id,
        submission_key: row.submission_key,
        base_uid: base,
        outcome: "hold_for_review",
        reason:
          "The sheet already has a row for this fixture that no confirmed submission accounts for, so this attempt may have landed. Held for review — not retried.",
        label: labelFor(row),
      });
    } else {
      out.push({
        id: row.id,
        submission_key: row.submission_key,
        base_uid: base,
        outcome: "retry_ready",
        reason: "No sheet row exists for this fixture — safe to retry.",
        label: labelFor(row),
      });
    }
  }
  return out;
}

export function summarise(decisions: ResyncDecision[]) {
  return {
    checked: decisions.length,
    retryReady: decisions.filter((d) => d.outcome === "retry_ready").length,
    heldForReview: decisions.filter((d) => d.outcome === "hold_for_review").length,
  };
}
