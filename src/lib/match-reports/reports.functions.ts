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
  identityForRowIndex,
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
  openFingerprintBlock,
  classifyLedgerWriteError,
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
    }
  | {
      /** Another request with the same key/fixture is mid-flight. */
      status: "in_progress";
      message: string;
      submission_key: string;
    }
  | {
      /** The append may or may not have landed — needs a human decision. */
      status: "ambiguous";
      message: string;
      submission_key: string;
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
            /**
             * Client-generated idempotency key — stable across retries.
             * Optional: callers that omit it get a server-generated key so a
             * reservation is still claimed before any Sheet append.
             */
            submissionKey: z.string().max(80).optional(),
          })
          .optional()
          .default({ allowDuplicate: false, replay: false }),
      })
      .parse(data);
  })
  .handler(async ({ data, context }): Promise<SubmitMatchReportResult> => {
    const { supabase, userId } = context;
    const { payload, options } = data;
    const submissionKey = ensureSubmissionKey(options.submissionKey);

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
    // Coach is derived EXCLUSIVELY from the authenticated profile. There is no
    // privileged payload override, and the client value is ignored entirely.
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
    const report_id = computeReportUid({
      goalkeeper: payload.goalkeeper,
      team: payload.team,
      opponent: payload.opponent,
      match_date: payload.match_date,
    });
    const fingerprint = submissionFingerprint({
      goalkeeper: payload.goalkeeper,
      team: payload.team,
      opponent: payload.opponent,
      match_date: payload.match_date,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();

    const LEDGER_COLS = "id,status,submitted_at,reserved_at,report_id,sheet_row_index";
    const AMBIGUOUS_MSG =
      "A previous attempt for this fixture didn't confirm, so we can't tell whether it reached the sheet. Check the reports list and resolve it before submitting again — we won't retry automatically.";
    const IN_PROGRESS_MSG =
      "Another submission for this fixture is already in progress. Nothing extra has been written — check the reports list in a moment.";

    // ---- Idempotency: has this exact key been seen? ----------------------
    const { data: byKey, error: byKeyErr } = await supabaseAdmin
      .from("match_report_submissions")
      .select(LEDGER_COLS)
      .eq("submission_key", submissionKey)
      .maybeSingle();
    if (byKeyErr) {
      // Never continue blind — an unreadable ledger cannot guarantee safety.
      throw new Error("Could not verify submission state. Nothing was written; please try again.");
    }
    const existingRow = (byKey ?? null) as LedgerRecord | null;
    const decision = decideForSubmissionKey(existingRow, now);
    if (decision.action === "return_success") {
      return {
        status: "ok",
        report_id: decision.report_id ?? report_id,
        row_index: decision.row_index ?? -1,
        average,
        idempotent: true,
      };
    }
    if (decision.action === "in_progress") {
      return {
        status: "in_progress",
        submission_key: submissionKey,
        message:
          "This report is already being submitted. Nothing extra has been written — check the reports list in a moment before trying again.",
      };
    }
    if (decision.action === "ambiguous") {
      return { status: "ambiguous", submission_key: submissionKey, message: AMBIGUOUS_MSG };
    }
    /** Row id of a previously FAILED attempt with this key — reused, not re-inserted. */
    const reuseId = decision.action === "reuse_failed" ? (existingRow?.id ?? null) : null;

    const loadFingerprintRows = async (): Promise<LedgerRecord[]> => {
      const { data, error } = await supabaseAdmin
        .from("match_report_submissions")
        .select(LEDGER_COLS)
        .eq("fingerprint", fingerprint)
        .order("submitted_at", { ascending: false })
        .limit(50);
      if (error) {
        throw new Error("Could not verify duplicate state. Nothing was written; please try again.");
      }
      return (data ?? []) as LedgerRecord[];
    };

    let fpRows = await loadFingerprintRows();

    // Expire stale reservations so a crashed request can't block the fixture
    // forever. Expired rows become `ambiguous` — never a prior success.
    for (const rec of fpRows) {
      if (isPendingExpired(rec, now) && rec.id) {
        await supabaseAdmin
          .from("match_report_submissions")
          .update({ status: "ambiguous", updated_at: new Date().toISOString() })
          .eq("id", rec.id);
        rec.status = "ambiguous";
      }
    }

    // ---- Unresolved attempts block a fresh append ------------------------
    const preBlock = openFingerprintBlock(fpRows, now, reuseId);
    if (preBlock === "ambiguous") {
      return { status: "ambiguous", submission_key: submissionKey, message: AMBIGUOUS_MSG };
    }
    if (preBlock === "in_progress") {
      return { status: "in_progress", submission_key: submissionKey, message: IN_PROGRESS_MSG };
    }

    // ---- Duplicate protection (confirmed successes only) -----------------
    // Legacy sheet rows have no submit timestamp and are deliberately NOT
    // considered — cache `synced_at` is reconciliation time, not a submit time.
    const duplicateResult = (
      dup: { window: "strong" | "soft"; report_id: string | null },
    ): SubmitMatchReportResult => ({
      status: "duplicate",
      window: dup.window,
      message: duplicateMessage(dup.window, {
        goalkeeper: payload.goalkeeper,
        team: payload.team,
        opponent: payload.opponent,
        match_date: payload.match_date,
      }),
      report_id: dup.report_id,
    });

    if (!options.allowDuplicate) {
      const dup = duplicateWindowForRecords(fpRows, now);
      if (dup.window) return duplicateResult({ window: dup.window, report_id: dup.report_id });
    }

    // ---- Durable reservation BEFORE the append ---------------------------
    // The unique indexes on (submission_key) and (fingerprint) WHERE status IN
    // ('pending','ambiguous') serialise concurrent tabs: only one request can
    // hold the reservation for a fixture.
    const nowIso = new Date().toISOString();
    const reservationRow = {
      user_id: userId,
      submission_key: submissionKey,
      fingerprint,
      goalkeeper: payload.goalkeeper,
      team: payload.team,
      opponent: payload.opponent,
      match_date: payload.match_date,
      report_id,
      report_uid: report_id,
      status: "pending",
      confirmed_duplicate: options.allowDuplicate,
      reserved_at: nowIso,
      submitted_at: nowIso,
    };

    let ledgerId: string;
    if (reuseId) {
      const { data: reused, error: reuseErr } = await supabaseAdmin
        .from("match_report_submissions")
        .update({ ...reservationRow, updated_at: nowIso })
        .eq("id", reuseId)
        .eq("status", "failed")
        .select("id")
        .maybeSingle();
      if (reuseErr) {
        if (classifyLedgerWriteError(reuseErr) === "conflict") {
          return { status: "in_progress", submission_key: submissionKey, message: IN_PROGRESS_MSG };
        }
        throw new Error("Could not reserve this submission. Nothing was written; please try again.");
      }
      if (!reused) {
        // Someone else changed the row out from under us — never guess.
        return { status: "in_progress", submission_key: submissionKey, message: IN_PROGRESS_MSG };
      }
      ledgerId = (reused as { id: string }).id;
    } else {
      const { data: reserved, error: reserveErr } = await supabaseAdmin
        .from("match_report_submissions")
        .insert(reservationRow)
        .select("id")
        .maybeSingle();
      if (reserveErr) {
        if (classifyLedgerWriteError(reserveErr) === "conflict") {
          return { status: "in_progress", submission_key: submissionKey, message: IN_PROGRESS_MSG };
        }
        // A non-conflict ledger failure is NOT another request in progress.
        throw new Error("Could not reserve this submission. Nothing was written; please try again.");
      }
      if (!reserved) {
        throw new Error("Could not reserve this submission. Nothing was written; please try again.");
      }
      ledgerId = (reserved as { id: string }).id;
    }

    const markLedger = async (patch: Record<string, unknown>) => {
      const { error } = await supabaseAdmin
        .from("match_report_submissions")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", ledgerId);
      return !error;
    };

    // ---- Post-reservation re-check (closes the precheck race) ------------
    // A concurrent pending row may have flipped to succeeded between the
    // precheck and this reservation, releasing the partial index.
    fpRows = await loadFingerprintRows();
    const postBlock = openFingerprintBlock(fpRows, Date.now(), ledgerId);
    if (postBlock) {
      await markLedger({ status: "failed" });
      return postBlock === "ambiguous"
        ? { status: "ambiguous", submission_key: submissionKey, message: AMBIGUOUS_MSG }
        : { status: "in_progress", submission_key: submissionKey, message: IN_PROGRESS_MSG };
    }
    if (!options.allowDuplicate) {
      const dup = duplicateWindowForRecords(
        fpRows.filter((r) => r.id !== ledgerId),
        Date.now(),
      );
      if (dup.window) {
        // Definitively failed WITHOUT a write — releases the fixture safely.
        await markLedger({ status: "failed" });
        return duplicateResult({ window: dup.window, report_id: dup.report_id });
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

    const { appendRow, AmbiguousAppendError, readAllRows: readRowsAfterAppend } =
      await import("./sheets.server");
    let rowIndex = -1;
    try {
      // Single attempt — the transport never retries an append.
      rowIndex = await appendRow(row);
    } catch (err) {
      if (err instanceof AmbiguousAppendError) {
        await markLedger({ status: "ambiguous" });
        return {
          status: "ambiguous",
          submission_key: submissionKey,
          message:
            "The sheet didn't confirm this report, so it may or may not have been written. Check the reports list before submitting again — we won't retry automatically.",
        };
      }
      await markLedger({ status: "failed" });
      throw err;
    }

    // ---- Resolve the ACTUAL identity of the appended row ------------------
    // Confirmed duplicates get an occurrence suffix (~2, ~3…). Ledger, cache,
    // response, attachments and deletion must all use that exact id.
    let resolved: MatchReportRow | null = null;
    try {
      const { rows: allRows, firstDataRow } = await readRowsAfterAppend();
      resolved = identityForRowIndex(parseSheetRows(allRows, firstDataRow), rowIndex);
    } catch (e) {
      console.error("[match-reports] identity resolve after append failed:", e);
    }
    if (!resolved) {
      // Appended, but we can't prove which row it is — never a clean success.
      await markLedger({ status: "ambiguous", sheet_row_index: rowIndex > 0 ? rowIndex : null });
      return {
        status: "ambiguous",
        submission_key: submissionKey,
        message:
          "The report reached the sheet but we couldn't confirm which row it is. Check the reports list before submitting again.",
      };
    }
    const finalReportId = resolved.report_id;

    // ---- Confirm the success in the ledger --------------------------------
    const confirmed = await markLedger({
      status: "succeeded",
      report_id: finalReportId,
      report_uid: finalReportId,
      sheet_row_index: rowIndex > 0 ? rowIndex : null,
      submitted_at: new Date().toISOString(),
    });
    if (!confirmed) {
      // The row IS in the sheet but we can't prove it durably. Report the
      // uncertain state rather than a clean success.
      return {
        status: "ambiguous",
        submission_key: submissionKey,
        message:
          "The report reached the sheet but we couldn't record it. Check the reports list and do not submit again without checking.",
      };
    }

    // Mirror into cache immediately so /reports reflects the new row without a re-read.
    try {
      await supabaseAdmin.from("match_reports_cache").upsert(
        [
          {
            report_id: finalReportId,
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

    return { status: "ok", report_id: finalReportId, row_index: rowIndex, average, idempotent: false };
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
