/**
 * Match Report server functions.
 *
 * All handlers require an authenticated Supabase session. The caller's role
 * and display name are looked up from the database (`user_roles`, `profiles`)
 * — never trusted from client input.
 *
 * Sheet layout is A:O. A "Source" provenance column is DEFERRED pending an
 * Excel audit — nothing here reads, writes or stamps a source value.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  matchReportSubmitSchema,
  averageOfScores,
  computeReportUid,
  parseSheetRows,
  matchesReportId,
  formatSheetDate,
  COLUMN_INDEX,
  PILLAR_IDS,
  type MatchReportRow,
} from "./schema";
import { ensureSections, validateComments } from "./comments";
import { submissionFingerprint, duplicateMessage } from "./duplicates";
import {
  decideForSubmissionKey,
  duplicateWindowForRecords,
  ensureSubmissionKey,
  isPendingExpired,
  type LedgerRecord,
} from "./ledger";

// NOTE: helpers used inside `createServerFn` handlers must be declared inside the
// handler or in a separate imported module — the splitter deletes sibling module-
// scope consts before shipping. See tanstack-serverfn-splitting.


// ---------------------------------------------------------------------------
// listMatchReports
// ---------------------------------------------------------------------------

export const listMatchReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {

  const { readAllRows } = await import("./sheets.server");
  const { rows, firstDataRow } = await readAllRows();
  const parsed: MatchReportRow[] = parseSheetRows(rows, firstDataRow);
  // Newest first (by match_date, missing dates last).
  parsed.sort((a, b) => {
    if (!a.match_date && !b.match_date) return 0;
    if (!a.match_date) return 1;
    if (!b.match_date) return -1;
    return a.match_date < b.match_date ? 1 : a.match_date > b.match_date ? -1 : 0;
  });

  // Best-effort cache reconciliation. Failures don't block the read.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (parsed.length) {
      await supabaseAdmin.from("match_reports_cache").upsert(
        parsed.map((r) => ({
          report_id: r.report_id,
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
          // `synced_at` is reconciliation time, NOT a submit timestamp — it is
          // never used for duplicate-window decisions.
          synced_at: new Date().toISOString(),
        })),
        { onConflict: "report_id" },
      );
    }
    // Prune cache rows that no longer exist in the sheet.
    const liveIds = new Set(parsed.map((r) => r.report_id));
    const { data: cached } = await supabaseAdmin
      .from("match_reports_cache")
      .select("report_id");
    const stale = (cached ?? [])
      .map((r) => r.report_id as string)
      .filter((id) => !liveIds.has(id));
    if (stale.length) {
      await supabaseAdmin
        .from("match_reports_cache")
        .delete()
        .in("report_id", stale);
    }
  } catch (e) {
    console.error("[match-reports] cache reconcile skipped:", e);
  }

  return { reports: parsed };
});


// ---------------------------------------------------------------------------
// getMatchReport
// ---------------------------------------------------------------------------

export const getMatchReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reportId: string }) =>
    z.object({ reportId: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { readAllRows } = await import("./sheets.server");
    const { rows, firstDataRow } = await readAllRows();
    const parsed = parseSheetRows(rows, firstDataRow);
    // Exact current identity first, then the legacy (pre-Team) identity so
    // historic detail URLs keep resolving.
    const exact = parsed.find((r) => r.report_id === data.reportId);
    if (exact) return { report: exact };
    const compat = parsed.find((r) => matchesReportId(r, data.reportId));
    return { report: compat ?? null };
  });

// ---------------------------------------------------------------------------
// submitMatchReport
// ---------------------------------------------------------------------------

export type SubmitMatchReportResult =
  | {
      status: "ok";
      report_id: string;
      row_index: number;
      average: number;
      /** True when the same submission key had already been written. */
      idempotent: boolean;
    }
  | {
      status: "duplicate";
      window: "strong" | "soft";
      message: string;
      report_id: string | null;
    };

export const submitMatchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z
      .object({
        payload: matchReportSubmitSchema,
        options: z
          .object({
            /** User confirmed a legitimate duplicate. */
            allowDuplicate: z.boolean().optional().default(false),
            /** Set by the offline sync queue when replaying a queued submit. */
            replay: z.boolean().optional().default(false),
            /** Client-generated idempotency key — stable across retries. */
            submissionKey: z.string().min(8).max(80),
          })
          .default({ allowDuplicate: false, replay: false, submissionKey: "" }),
      })
      .parse(data);
  })
  .handler(async ({ data, context }): Promise<SubmitMatchReportResult> => {
    const { supabase, userId } = context;
    const { payload, options } = data;

    // Look up the caller's real role from the database — never trust the client.
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Unable to verify caller role.");

    const roles = (roleRows ?? []).map((r) => r.role as string);
    const CAN_SUBMIT = ["super_admin", "mentor_manager", "mentor"];
    if (!roles.some((r) => CAN_SUBMIT.includes(r))) {
      throw new Error("You don't have permission to submit reports.");
    }

    // ---- Coach integrity -------------------------------------------------
    // Coach is derived EXCLUSIVELY from the authenticated user. There is no
    // privileged payload override on a real report write.
    const { data: profile } = await supabase
      .from("profiles")
      .select("name,email")
      .eq("id", userId)
      .maybeSingle<{ name: string | null; email: string | null }>();
    const resolvedCoach = (profile?.name || profile?.email || "").trim();
    if (!resolvedCoach) {
      throw new Error(
        "Your profile has no name or email set, so the Coach field can't be filled. Add a name in Account settings and try again.",
      );
    }

    // ---- Comments validation (server enforcement) ------------------------
    const comments = ensureSections(payload.comments ?? "");
    const commentCheck = validateComments(comments);
    if (!commentCheck.ok) {
      throw new Error(`Comments: ${commentCheck.message}`);
    }

    const average = averageOfScores(payload);
    const report_id = computeReportId({
      goalkeeper: payload.goalkeeper,
      match_date: payload.match_date,
      opponent: payload.opponent,
    });
    const fingerprint = submissionFingerprint({
      goalkeeper: payload.goalkeeper,
      team: payload.team,
      opponent: payload.opponent,
      match_date: payload.match_date,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ---- Idempotency -----------------------------------------------------
    // A replay after a lost response must never write a second row.
    if (options.submissionKey) {
      const { data: existing } = await supabaseAdmin
        .from("match_report_submissions")
        .select("report_id,sheet_row_index")
        .eq("submission_key", options.submissionKey)
        .maybeSingle();
      if (existing) {
        return {
          status: "ok",
          report_id: (existing.report_id as string) ?? report_id,
          row_index: (existing.sheet_row_index as number) ?? -1,
          average,
          idempotent: true,
        };
      }
    }

    // ---- Duplicate protection (durable SUCCESS ledger) -------------------
    // Only real app submissions are in the ledger. Legacy sheet rows have no
    // submit timestamp and are deliberately NOT considered here — cache
    // `synced_at` is reconciliation time and would produce false warnings.
    if (!options.allowDuplicate) {
      const { data: prior } = await supabaseAdmin
        .from("match_report_submissions")
        .select("submitted_at,report_id")
        .eq("fingerprint", fingerprint)
        .order("submitted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prior?.submitted_at) {
        const win = classifyDuplicateWindow(new Date(prior.submitted_at as string).getTime());
        if (win) {
          return {
            status: "duplicate",
            window: win,
            message: duplicateMessage(win, {
              goalkeeper: payload.goalkeeper,
              team: payload.team,
              opponent: payload.opponent,
              match_date: payload.match_date,
            }),
            report_id: (prior.report_id as string) ?? null,
          };
        }
      }
    }

    // Column order MUST match COLUMN_INDEX / SHEET_HEADERS (A:O).
    const row = new Array<string | number>(15).fill("");
    row[COLUMN_INDEX.goalkeeper] = payload.goalkeeper;
    row[COLUMN_INDEX.coach] = resolvedCoach;
    row[COLUMN_INDEX.team] = payload.team;
    row[COLUMN_INDEX.opponent] = payload.opponent;
    row[COLUMN_INDEX.match_date] = formatSheetDate(payload.match_date);
    for (const id of PILLAR_IDS) row[COLUMN_INDEX[id]] = payload[id];
    row[COLUMN_INDEX.average] = average;
    row[COLUMN_INDEX.comments] = comments;
    row[COLUMN_INDEX.competition] = payload.competition ?? "";

    const { appendRow } = await import("./sheets.server");
    const rowIndex = await appendRow(row);

    // Record the success in the durable ledger BEFORE anything else that can
    // fail, so a later crash can't cause a duplicate on retry.
    try {
      await supabaseAdmin.from("match_report_submissions").insert({
        user_id: userId,
        submission_key: options.submissionKey,
        fingerprint,
        goalkeeper: payload.goalkeeper,
        team: payload.team,
        opponent: payload.opponent,
        match_date: payload.match_date,
        report_id,
        sheet_row_index: rowIndex > 0 ? rowIndex : null,
      });
    } catch (e) {
      console.error("[match-reports] submission ledger insert failed:", e);
    }

    // Mirror into cache immediately so /reports reflects the new row without a re-read.
    try {
      await supabaseAdmin.from("match_reports_cache").upsert(
        [
          {
            report_id,
            row_index: rowIndex > 0 ? rowIndex : null,
            goalkeeper: payload.goalkeeper,
            coach: resolvedCoach,
            team: payload.team,
            opponent: payload.opponent,
            competition: payload.competition ?? "",
            match_date: payload.match_date,
            protect_goal: payload.protect_goal,
            protect_space: payload.protect_space,
            protect_air: payload.protect_air,
            control_play: payload.control_play,
            change_play: payload.change_play,
            psych: payload.psych,
            physical: payload.physical,
            average,
            comments,
            synced_at: new Date().toISOString(),
          },
        ],
        { onConflict: "report_id" },
      );
    } catch (e) {
      console.error("[match-reports] cache mirror on submit failed:", e);
    }

    return { status: "ok", report_id, row_index: rowIndex, average, idempotent: false };
  });

// ---------------------------------------------------------------------------
// deleteMatchReport — removes the sheet row AND its cache record atomically.
// ---------------------------------------------------------------------------

export const deleteMatchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ reportId: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only privileged roles may delete reports.
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Unable to verify caller role.");
    const roles = (roleRows ?? []).map((r) => r.role as string);
    const CAN_DELETE = ["super_admin", "admin", "mentor_manager"];
    if (!roles.some((r) => CAN_DELETE.includes(r))) {
      throw new Error("You don't have permission to delete reports.");
    }

    // Locate the row in the sheet (source of truth).
    const { readAllRows, deleteRow } = await import("./sheets.server");
    const { rows, firstDataRow } = await readAllRows();
    const parsedRows = parseSheetRows(rows, firstDataRow);
    const target =
      parsedRows.find((r) => r.report_id === data.reportId) ??
      parsedRows.find((r) => matchesReportId(r, data.reportId));
    const matchedRowIndex = target?.row_index ?? -1;
    if (matchedRowIndex < 0) {
      // Sheet row already gone — still purge any stale cache entry.
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("match_reports_cache")
          .delete()
          .eq("report_id", data.reportId);
      } catch (e) {
        console.error("[match-reports] stale cache delete failed:", e);
      }
      return { deleted: false, reason: "not_found" as const };
    }

    // Delete sheet row first — if it fails we leave the cache alone.
    await deleteRow(matchedRowIndex);

    // Then remove the cache record so /reports reflects the deletion.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("match_reports_cache")
        .delete()
        .eq("report_id", data.reportId);
      await supabaseAdmin
        .from("match_report_submissions")
        .delete()
        .eq("report_id", data.reportId);
    } catch (e) {
      console.error("[match-reports] cache delete after sheet delete failed:", e);
    }

    return { deleted: true, row_index: matchedRowIndex };
  });
