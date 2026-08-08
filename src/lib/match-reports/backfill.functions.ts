/**
 * One-time (re-runnable) import of the Google Sheets Match Report history into
 * the canonical Supabase store, plus the reconciliation that has to pass before
 * the Sheet can be treated as a dormant archive.
 *
 * This is the ONLY place left that reads Google Sheets for Match Report data,
 * and it is never on a runtime path: it runs when a super admin asks for it
 * from /system/integrations.
 *
 * Safety properties:
 *  - Idempotent. `report_id` is deterministic, so re-running upserts the same
 *    rows rather than duplicating them.
 *  - Non-destructive. It never deletes, and it never overwrites a report that
 *    was submitted through the app (`source = 'app'`).
 *  - Never resurrects. Soft-deleted reports are skipped, not re-imported.
 *  - `dryRun` reconciles without writing anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PILLAR_IDS, type MatchReportRow } from "./schema";

export interface BackfillFieldMismatch {
  report_id: string;
  field: string;
  sheet: string;
  supabase: string;
}

export interface MatchReportBackfillResult {
  dryRun: boolean;
  checkedAt: string;
  /** True only when every reconciliation check passed. */
  ok: boolean;
  /** Human-readable reasons the reconciliation failed, if any. */
  problems: string[];
  sheet: {
    /** Raw data rows returned by the Sheet (header excluded). */
    rawRows: number;
    /** Rows that parse into a valid Match Report (a goalkeeper name is required). */
    validReports: number;
    /** Rows skipped as unparseable/blank. */
    skippedRows: number;
    /** Fixtures appearing more than once, separated by ~2/~3 occurrence ids. */
    duplicateBaseIds: { base_report_id: string; occurrences: number }[];
  };
  supabase: {
    totalBefore: number;
    totalAfter: number;
    liveAfter: number;
    fromSheet: number;
    fromApp: number;
    tombstoned: number;
  };
  imported: number;
  skippedAppOwned: number;
  skippedTombstoned: number;
  /** Sheet report ids still absent from Supabase after the import. */
  missingInSupabase: string[];
  /** Supabase sheet-sourced ids that no longer exist in the Sheet (archive drift). */
  extraInSupabase: string[];
  fieldMismatches: BackfillFieldMismatch[];
}

export const importMatchReportsFromSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ dryRun: z.boolean().optional().default(false) })
      .optional()
      .default({ dryRun: false })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<MatchReportBackfillResult> => {
    const { supabase, userId } = context;

    // Super-admin only — this reaches outside the app to Google Sheets.
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Unable to verify caller role.");
    const roles = (roleRows ?? []).map((r) => r.role as string);
    if (!roles.includes("super_admin")) {
      throw new Error("Forbidden: super_admin role required.");
    }

    const { parseSheetRows, computeReportId } = await import("./schema");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CANONICAL_TABLE, CANONICAL_COLUMNS, toMatchReportRow } = await import("./store.server");
    const { readAllRows } = await import("./sheets.server");

    const checkedAt = new Date().toISOString();
    const dryRun = data.dryRun;

    // ---- Source of the import: the Sheet, read fresh --------------------
    const { rows, firstDataRow } = await readAllRows({ fresh: true });
    const parsed = parseSheetRows(rows, firstDataRow);

    const occurrences = new Map<string, number>();
    for (const r of parsed) {
      const base = r.report_id.split("~")[0];
      occurrences.set(base, (occurrences.get(base) ?? 0) + 1);
    }
    const duplicateBaseIds = [...occurrences.entries()]
      .filter(([, n]) => n > 1)
      .map(([base_report_id, occ]) => ({ base_report_id, occurrences: occ }));

    // ---- Current canonical state (including tombstones) ------------------
    type ExistingRow = { report_id: string; source: string | null; deleted_at: string | null };
    const loadExisting = async (): Promise<ExistingRow[]> => {
      const out: ExistingRow[] = [];
      for (let page = 0; ; page++) {
        const { data: chunk, error } = await supabaseAdmin
          .from(CANONICAL_TABLE)
          .select("report_id,source,deleted_at")
          .range(page * 1000, page * 1000 + 999);
        if (error) throw new Error(`Could not read the canonical store: ${error.message}`);
        const list = (chunk ?? []) as ExistingRow[];
        out.push(...list);
        if (list.length < 1000) break;
      }
      return out;
    };

    const before = await loadExisting();
    const bySource = new Map(before.map((r) => [r.report_id, r]));
    const tombstoned = new Set(before.filter((r) => r.deleted_at).map((r) => r.report_id));
    const appOwned = new Set(
      before.filter((r) => r.source === "app" && !r.deleted_at).map((r) => r.report_id),
    );

    // A deleted report is never resurrected, and an app-submitted report is
    // never overwritten by the archive.
    const candidates = parsed.filter(
      (r) => !tombstoned.has(r.report_id) && !appOwned.has(r.report_id),
    );
    const skippedTombstoned = parsed.filter((r) => tombstoned.has(r.report_id)).length;
    const skippedAppOwned = parsed.filter((r) => appOwned.has(r.report_id)).length;

    const toRow = (r: MatchReportRow) => ({
      report_id: r.report_id,
      legacy_report_id:
        r.legacy_report_id ||
        computeReportId({
          goalkeeper: r.goalkeeper,
          match_date: r.match_date,
          opponent: r.opponent,
        }),
      row_index: r.row_index,
      goalkeeper: r.goalkeeper,
      coach: r.coach,
      team: r.team,
      opponent: r.opponent,
      competition: r.competition,
      match_date: r.match_date,
      protect_goal: r.scores.protect_goal,
      protect_space: r.scores.protect_space,
      protect_air: r.scores.protect_air,
      control_play: r.scores.control_play,
      change_play: r.scores.change_play,
      psych: r.scores.psych,
      physical: r.scores.physical,
      average: r.average,
      comments: r.comments,
      source: "sheet",
      // Import time, never a submit time — historical rows keep a NULL
      // submitted_at so no duplicate window can ever be derived from them.
      synced_at: checkedAt,
    });

    let imported = 0;
    if (!dryRun && candidates.length) {
      const CHUNK = 200;
      for (let i = 0; i < candidates.length; i += CHUNK) {
        const batch = candidates.slice(i, i + CHUNK).map(toRow);
        const { error } = await supabaseAdmin
          .from(CANONICAL_TABLE)
          .upsert(batch, { onConflict: "report_id" });
        if (error) throw new Error(`Import failed at row ${i}: ${error.message}`);
        imported += batch.length;
      }
    }

    // ---- Reconciliation --------------------------------------------------
    const afterRowsById = new Map<string, MatchReportRow>();
    let totalAfter = 0;
    let fromSheet = 0;
    let fromApp = 0;
    let tombstonedAfter = 0;
    for (let page = 0; ; page++) {
      const { data: chunk, error } = await supabaseAdmin
        .from(CANONICAL_TABLE)
        .select(CANONICAL_COLUMNS)
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(`Could not verify the import: ${error.message}`);
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const list = (chunk ?? []) as any[];
      for (const row of list) {
        totalAfter += 1;
        if (row.deleted_at) tombstonedAfter += 1;
        if (row.source === "app") fromApp += 1;
        else fromSheet += 1;
        if (!row.deleted_at) afterRowsById.set(row.report_id, toMatchReportRow(row));
      }
      if (list.length < 1000) break;
    }

    const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
    const missingInSupabase: string[] = [];
    const fieldMismatches: BackfillFieldMismatch[] = [];
    for (const r of parsed) {
      if (tombstoned.has(r.report_id)) continue;
      const found = afterRowsById.get(r.report_id);
      if (!found) {
        missingInSupabase.push(r.report_id);
        continue;
      }
      // App-submitted reports legitimately differ from an archive row that
      // happens to share the identity; only sheet-sourced rows are compared.
      if (appOwned.has(r.report_id)) continue;
      const checks: [string, unknown, unknown][] = [
        ["goalkeeper", r.goalkeeper, found.goalkeeper],
        ["coach", r.coach, found.coach],
        ["team", r.team, found.team],
        ["opponent", r.opponent, found.opponent],
        ["competition", r.competition, found.competition],
        ["match_date", r.match_date, found.match_date],
        ["average", r.average, found.average],
        ...PILLAR_IDS.map(
          (p) => [p, r.scores[p], found.scores[p]] as [string, unknown, unknown],
        ),
      ];
      for (const [field, sheetValue, dbValue] of checks) {
        if (norm(sheetValue) !== norm(dbValue)) {
          fieldMismatches.push({
            report_id: r.report_id,
            field,
            sheet: norm(sheetValue),
            supabase: norm(dbValue),
          });
        }
      }
    }

    const sheetIds = new Set(parsed.map((r) => r.report_id));
    const extraInSupabase = [...afterRowsById.keys()].filter(
      (id) => !sheetIds.has(id) && bySource.get(id)?.source !== "app",
    );

    const problems: string[] = [];
    if (missingInSupabase.length) {
      problems.push(`${missingInSupabase.length} sheet report(s) are not in Supabase.`);
    }
    if (fieldMismatches.length) {
      problems.push(`${fieldMismatches.length} field value(s) disagree with the sheet.`);
    }
    if (parsed.length === 0) {
      problems.push("The sheet returned no parseable reports — refusing to call this a success.");
    }

    return {
      dryRun,
      checkedAt,
      ok: problems.length === 0,
      problems,
      sheet: {
        rawRows: rows.length,
        validReports: parsed.length,
        skippedRows: rows.length - parsed.length,
        duplicateBaseIds,
      },
      supabase: {
        totalBefore: before.length,
        totalAfter,
        liveAfter: afterRowsById.size,
        fromSheet,
        fromApp,
        tombstoned: tombstonedAfter,
      },
      imported,
      skippedAppOwned,
      skippedTombstoned,
      missingInSupabase: missingInSupabase.slice(0, 50),
      extraInSupabase: extraInSupabase.slice(0, 50),
      fieldMismatches: fieldMismatches.slice(0, 50),
    };
  });
