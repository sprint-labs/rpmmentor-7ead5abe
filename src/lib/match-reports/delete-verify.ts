/**
 * Content-based verification for ambiguous Sheet row deletions.
 *
 * WHY THIS EXISTS
 * ---------------
 * `parseSheetRows` derives duplicate identities by *occurrence order*
 * (`mr2_x`, `mr2_x~2`, `mr2_x~3`). That makes occurrence identity useless for
 * proving whether an ambiguous delete landed: if the base row is removed, the
 * following duplicate shifts up and re-acquires the base id, so an
 * "is the id still present?" check answers "yes" for a delete that DID apply.
 * A retry driven by that answer deletes the *next* report.
 *
 * Instead we compare a stable, content-derived signature of the raw A:O row
 * and count how many rows carry that signature before and after. A verified
 * decrease for the target content proves the delete landed.
 */

/** Normalised, content-only signature of a raw sheet row (columns A:O). */
export function rawRowSignature(row: readonly (string | null | undefined)[]): string {
  const cells: string[] = [];
  for (let i = 0; i < 15; i++) {
    cells.push(
      String(row[i] ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    );
  }
  return cells.join("\u001f");
}

/** How many raw rows carry `signature`. */
export function countSignature(
  rows: readonly (readonly (string | null | undefined)[])[],
  signature: string,
): number {
  let n = 0;
  for (const r of rows) if (rawRowSignature(r) === signature) n += 1;
  return n;
}

export type DeleteVerdict =
  /** Row content count decreased by exactly one — the delete landed. */
  | { outcome: "applied"; duplicatesRemaining: number }
  /** Count unchanged — nothing was removed; the same row index is safe to retry. */
  | { outcome: "not_applied" }
  /** Read-back unavailable or inconsistent — never retry automatically. */
  | { outcome: "unknown"; detail: string };

/**
 * Decide whether an ambiguous delete landed, purely from raw content counts.
 * Never consults occurrence-derived (`~n`) identities.
 */
export function classifyDeleteReadback(args: {
  signature: string;
  countBefore: number;
  rowsAfter: readonly (readonly (string | null | undefined)[])[] | null;
}): DeleteVerdict {
  const { signature, countBefore, rowsAfter } = args;
  if (!rowsAfter) return { outcome: "unknown", detail: "read-back failed" };
  const countAfter = countSignature(rowsAfter, signature);
  if (countAfter === countBefore - 1) {
    return { outcome: "applied", duplicatesRemaining: countAfter };
  }
  if (countAfter === countBefore) return { outcome: "not_applied" };
  return {
    outcome: "unknown",
    detail: `row count for this content went from ${countBefore} to ${countAfter}`,
  };
}

/**
 * Duplicate/reindex risk is a question of *identity*, not raw content.
 *
 * `computeReportUid` keys on Goalkeeper + Team + Opponent + Match Date only, so
 * two confirmed duplicates whose comments or scores differ still receive
 * `base` / `~2` identities. Deleting either one reindexes the survivor, which
 * makes identity-based cache/ledger cleanup unsafe even though the raw rows are
 * not identical. Count the parsed reports sharing the target's *base* uid.
 */
export function countBaseGroup(
  reports: readonly { report_id: string }[],
  baseUid: string,
  baseOf: (id: string) => string,
): number {
  let n = 0;
  for (const r of reports) if (baseOf(r.report_id) === baseUid) n += 1;
  return n;
}

/** True when deleting this row would reindex sibling identities. */
export function hasDuplicateIdentityGroup(
  reports: readonly { report_id: string }[],
  targetReportId: string,
  baseOf: (id: string) => string,
): boolean {
  return countBaseGroup(reports, baseOf(targetReportId), baseOf) > 1;
}
