/**
 * Match Report server functions.
 *
 * All handlers require an authenticated Supabase session. The caller's role
 * and display name are looked up from the database (`user_roles`, `profiles`)
 * — never trusted from client input.
 *
 * SUPABASE IS THE SOURCE OF TRUTH. Reads, writes and deletes all go to the
 * canonical table via `store.server.ts`; no handler here touches Google Sheets.
 * The Sheet remains as a dormant archive/rollback source, imported once by
 * `backfill.functions.ts`.
 *
 * The duplicate/idempotency protections are unchanged: the submission ledger
 * (`match_report_submissions`) still reserves a fixture before the write,
 * classifies duplicate windows from confirmed successes only, and serialises
 * concurrent tabs through its partial unique indexes.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  matchReportSubmitSchema,
  matchReportEditSchema,
  averageOfScores,
  computeReportUid,
  computeReportId,
  type MatchReportRow,
} from "./schema";
import { validateComments } from "./comments";
import { submissionFingerprint, duplicateMessage } from "./duplicates";
import {
  ensureMatchReportInteraction,
  matchReportInteractionNotes,
} from "@/lib/interactions/match-report-link";
import {
  decideForSubmissionKey,
  duplicateWindowForRecords,
  ensureSubmissionKey,
  isPendingExpired,
  openFingerprintBlock,
  classifyLedgerWriteError,
  type LedgerRecord,
} from "./ledger";
import {
  hasAnyRole,
  getUserRoles,
  REPORT_MANAGE_ROLES,
  REPORT_SUBMIT_ROLES,
  type AppRole,
} from "@/lib/roles.server";

// NOTE: helpers used inside `createServerFn` handlers must be declared inside the
// handler or in a separate imported module — the splitter deletes sibling module-
// scope consts before shipping. See tanstack-serverfn-splitting.

// ---------------------------------------------------------------------------
// listMatchReports
// ---------------------------------------------------------------------------

export const listMatchReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Supabase is the source of truth. Google Sheets is not consulted here —
    // it is a dormant archive, and nothing on this path can be blocked by the
    // connector being unlinked or rate-limited.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listCanonicalReports } = await import("./store.server");
    const reports: MatchReportRow[] = await listCanonicalReports(supabaseAdmin);
    return { reports };
  });

// ---------------------------------------------------------------------------
// getMatchReport
// ---------------------------------------------------------------------------

export const getMatchReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { reportId: string }) => z.object({ reportId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    // Resolution order is unchanged: exact identity first, then the base id of
    // an occurrence, then the legacy (pre-Team) identity — so historic detail
    // URLs keep resolving. Only the storage behind it moved to Supabase.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCanonicalReport } = await import("./store.server");
    const report = await getCanonicalReport(supabaseAdmin, data.reportId);
    return { report };
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
      /**
       * Set when the report was written but its Live Match Observation
       * interaction could not be. The submission is NOT a clean success and the
       * UI must say so rather than reporting everything went through.
       */
      interaction_error?: string;
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
  .validator((data: unknown) => {
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
             * reservation is still claimed before any canonical write.
             */
            submissionKey: z.string().max(80).optional(),
            /**
             * The scheduled Match event this report writes up, when the form was
             * opened from one. Confirmed against `calendar_events` before
             * anything is written.
             */
            calendarEventId: z
              .string()
              .regex(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
                "calendarEventId must be a calendar_events.id",
              )
              .optional(),
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

    const roles = (roleRows ?? []).map((r) => r.role as AppRole);
    if (!hasAnyRole(roles, REPORT_SUBMIT_ROLES)) {
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
    const comments = (payload.comments ?? "").trim();
    const commentCheck = validateComments(comments);
    if (!commentCheck.ok) {
      throw new Error(`Comments: ${commentCheck.message}`);
    }

    // ---- Scheduled event link --------------------------------------------
    // Checked here, before the ledger reserves anything, so an invalid link
    // fails cleanly with nothing to unwind. A Match Report may only close out a
    // Match event, and only for the mentor it was assigned to or a manager.
    let linkedMatchTarget: import("@/lib/events/link-follow-up.server").VerifiedEventLink | null =
      null;
    if (options.calendarEventId) {
      const { verifyFollowUpTarget } = await import("@/lib/events/link-follow-up.server");
      linkedMatchTarget = await verifyFollowUpTarget(
        supabase,
        userId,
        options.calendarEventId,
        "match_report",
      );
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
      "A previous attempt for this fixture didn't confirm, so we can't tell whether it was saved. Check the reports list and resolve it before submitting again — we won't retry automatically.";
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
      const replayedReportId = decision.report_id ?? report_id;
      type ReplayedReport = {
        report_id: string;
        calendar_event_id: string | null;
        calendar_event_player_id: string | null;
        goalkeeper: string;
        match_date: string | null;
        team: string | null;
        opponent: string | null;
        competition: string | null;
        average: number | string | null;
        comments: string | null;
        submitted_by: string | null;
        coach: string | null;
      };
      let replayedReport: ReplayedReport | null = null;
      if (linkedMatchTarget) {
        // Re-read the canonical row instead of relying on the earlier event
        // snapshot: another retry may have completed between those two reads.
        // This preserves a legitimate race/idempotent retry while preventing a
        // known submission key from being replayed against a different event.
        const { data: savedReport, error: replayedReportError } = await supabaseAdmin
          .from("match_reports_cache")
          .select(
            "report_id,calendar_event_id,calendar_event_player_id,goalkeeper,match_date,team,opponent,competition,average,comments,submitted_by,coach",
          )
          .eq("report_id", replayedReportId)
          .is("deleted_at", null)
          .maybeSingle();
        if (
          replayedReportError ||
          !savedReport ||
          savedReport.calendar_event_id !== linkedMatchTarget.eventId
        ) {
          throw new Error(
            "That saved Match Report is not linked to this calendar event. Nothing was changed.",
          );
        }
        replayedReport = savedReport as ReplayedReport;
        const { assertMatchReportMatchesEvent } =
          await import("@/lib/events/link-follow-up.server");
        // The event may have been edited after this report was saved. Never
        // combine the old report's facts with a different current player/date
        // to manufacture new Duty of Care evidence during self-healing.
        assertMatchReportMatchesEvent(linkedMatchTarget, {
          goalkeeperName: replayedReport.goalkeeper,
          matchDate: replayedReport.match_date ?? "",
        });
      }
      const savedAverage = replayedReport ? Number(replayedReport.average) : Number.NaN;
      const interactionAverage = replayedReport
        ? Number.isFinite(savedAverage)
          ? savedAverage
          : null
        : average;
      // Self-healing: a retry of an already-written report still guarantees the
      // interaction exists. For a linked report, evidence comes from the saved
      // report and canonical event rather than an editable/restored retry form.
      // The unique index makes this a no-op if the interaction already exists.
      const link = await ensureMatchReportInteraction(supabase, {
        reportId: replayedReportId,
        playerId: replayedReport?.calendar_event_player_id ?? linkedMatchTarget?.playerId ?? null,
        goalkeeperName:
          linkedMatchTarget?.goalkeeperName ?? replayedReport?.goalkeeper ?? payload.goalkeeper,
        club: replayedReport ? (replayedReport.team ?? "") : payload.team,
        matchDate: linkedMatchTarget?.eventDate ?? payload.match_date,
        mentorId: replayedReport?.submitted_by ?? linkedMatchTarget?.assignedMentorId ?? userId,
        mentorName: replayedReport ? (replayedReport.coach ?? "") : resolvedCoach,
        notes: matchReportInteractionNotes({
          opponent: replayedReport ? (replayedReport.opponent ?? "") : payload.opponent,
          competition: replayedReport ? (replayedReport.competition ?? "") : payload.competition,
          average: interactionAverage,
          comments: replayedReport ? (replayedReport.comments ?? "") : comments,
        }),
      });
      return {
        status: "ok",
        report_id: replayedReportId,
        row_index: decision.row_index ?? -1,
        average: interactionAverage ?? average,
        idempotent: true,
        ...(link.ok ? {} : { interaction_error: link.message }),
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
    // Only a confirmed idempotent success above may bypass editable draft
    // fields that no longer match a historic report. Every path that could
    // create a report is pinned to the event's canonical goalkeeper and date
    // before a ledger reservation or canonical write occurs.
    if (linkedMatchTarget) {
      const { assertMatchReportMatchesEvent } = await import("@/lib/events/link-follow-up.server");
      assertMatchReportMatchesEvent(linkedMatchTarget, {
        goalkeeperName: payload.goalkeeper,
        matchDate: payload.match_date,
      });
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
    // Backfilled sheet history has no submit timestamp and is deliberately NOT
    // considered — cache `synced_at` is reconciliation time, not a submit time.
    const duplicateResult = (dup: {
      window: "strong" | "soft";
      report_id: string | null;
    }): SubmitMatchReportResult => ({
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
        throw new Error(
          "Could not reserve this submission. Nothing was written; please try again.",
        );
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
        throw new Error(
          "Could not reserve this submission. Nothing was written; please try again.",
        );
      }
      if (!reserved) {
        throw new Error(
          "Could not reserve this submission. Nothing was written; please try again.",
        );
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

    // ---- The canonical write ---------------------------------------------
    // Supabase, not Google Sheets. A confirmed duplicate fixture still gets an
    // occurrence id (~2, ~3…) exactly as the sheet parser assigned them, and
    // the unique index on `submission_key` means a retry can never produce a
    // second report. Ledger, response, attachments and deletion all use the
    // exact id returned here.
    const { insertCanonicalReport, CANONICAL_TABLE } = await import("./store.server");
    let written: Awaited<ReturnType<typeof insertCanonicalReport>>;
    try {
      written = await insertCanonicalReport(supabaseAdmin, {
        baseReportId: report_id,
        legacyReportId: computeReportId({
          goalkeeper: payload.goalkeeper,
          match_date: payload.match_date,
          opponent: payload.opponent,
        }),
        goalkeeper: payload.goalkeeper,
        coach: resolvedCoach,
        team: payload.team,
        opponent: payload.opponent,
        competition: payload.competition ?? "",
        match_date: payload.match_date,
        scores: {
          protect_goal: payload.protect_goal,
          protect_space: payload.protect_space,
          protect_air: payload.protect_air,
          control_play: payload.control_play,
          change_play: payload.change_play,
          psych: payload.psych,
          physical: payload.physical,
        },
        average,
        comments,
        submittedBy: userId,
        submissionKey: submissionKey,
        calendarEventId: options.calendarEventId ?? null,
        calendarEventPlayerId: linkedMatchTarget?.playerId ?? null,
      });
    } catch (err) {
      // The insert threw rather than returning an error — the write may or may
      // not have landed. `submission_key` is unique, so a read-back settles it
      // definitively instead of leaving an ambiguous lock behind.
      let verified: string | null = null;
      let verifiedPlayerId: string | null = null;
      let verifiable = true;
      try {
        const { data: check } = await supabaseAdmin
          .from(CANONICAL_TABLE)
          .select("report_id,calendar_event_player_id")
          .eq("submission_key", submissionKey)
          .maybeSingle();
        const verifiedRow = check as {
          report_id: string;
          calendar_event_player_id?: string | null;
        } | null;
        verified = verifiedRow?.report_id ?? null;
        verifiedPlayerId = verifiedRow?.calendar_event_player_id ?? null;
      } catch {
        verifiable = false;
      }
      if (!verified) {
        if (verifiable) {
          // Proven no-write: release the reservation so the same form and
          // submission key work again.
          await markLedger({ status: "failed" });
          throw err;
        }
        await markLedger({ status: "ambiguous" });
        return {
          status: "ambiguous",
          submission_key: submissionKey,
          message:
            "The database didn't confirm this report, so it may or may not have been saved. Check the reports list before submitting again — we won't retry automatically.",
        };
      }
      written = {
        ok: true,
        report_id: verified,
        created: true,
        ...(options.calendarEventId ? { calendarEventPlayerId: verifiedPlayerId } : {}),
      };
    }

    if (!written.ok) {
      // A returned error means nothing was inserted — definitively safe to retry.
      await markLedger({ status: "failed" });
      throw new Error(
        `The report could not be saved (${written.message}). Nothing was written, so you can submit it again.`,
      );
    }
    const finalReportId = written.report_id;

    // ---- Confirm the success in the ledger --------------------------------
    // `sheet_row_index` stays null: reports born in Supabase have no sheet row.
    const confirmed = await markLedger({
      status: "succeeded",
      report_id: finalReportId,
      report_uid: finalReportId,
      sheet_row_index: null,
      submitted_at: new Date().toISOString(),
    });
    if (!confirmed) {
      // The report IS saved but we can't prove it durably. Report the uncertain
      // state rather than a clean success.
      return {
        status: "ambiguous",
        submission_key: submissionKey,
        message:
          "The report was saved but we couldn't record it. Check the reports list and do not submit again without checking.",
      };
    }

    // ---- The Live Match Observation interaction ---------------------------
    // Change #1: the report and its interaction are written by this one
    // server-controlled call, keyed on the canonical report id. The database's
    // partial unique index on `match_report_id` guarantees exactly one
    // interaction per report however many times submission is retried.
    const link = await ensureMatchReportInteraction(supabase, {
      reportId: finalReportId,
      playerId: written.calendarEventPlayerId ?? linkedMatchTarget?.playerId ?? null,
      goalkeeperName: linkedMatchTarget?.goalkeeperName ?? payload.goalkeeper,
      club: payload.team,
      matchDate: linkedMatchTarget?.eventDate ?? payload.match_date,
      mentorId: userId,
      mentorName: resolvedCoach,
      notes: matchReportInteractionNotes({
        opponent: payload.opponent,
        competition: payload.competition,
        average,
        comments,
      }),
    });
    if (!link.ok) {
      console.error("[match-reports] interaction link failed:", link.message);
    }

    return {
      status: "ok",
      report_id: finalReportId,
      // Reports written to Supabase have no sheet row; -1 keeps the response
      // shape stable for callers that still read the field.
      row_index: -1,
      average,
      idempotent: false,
      ...(link.ok ? {} : { interaction_error: link.message }),
    };
  });

// ---------------------------------------------------------------------------
// updateMatchReport — management may correct comments and RPM pillar scores.
// ---------------------------------------------------------------------------

export type UpdateMatchReportResult =
  | { updated: true; report: MatchReportRow; interaction_error?: string }
  | { updated: false; report: null; reason: "not_found" };

export const updateMatchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => matchReportEditSchema.parse(data))
  .handler(async ({ data, context }): Promise<UpdateMatchReportResult> => {
    const { supabase, userId } = context;
    const roles = await getUserRoles(supabase, userId);
    if (!hasAnyRole(roles, REPORT_MANAGE_ROLES)) {
      throw new Error("You don't have permission to edit reports.");
    }

    const average = averageOfScores(data.scores);
    const comments = data.comments.trim();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { updateCanonicalReport } = await import("./store.server");
    const saved = await updateCanonicalReport(supabaseAdmin, {
      reportId: data.reportId,
      scores: data.scores,
      average,
      comments,
    });
    if (!saved.updated) {
      return { updated: false, report: null, reason: "not_found" };
    }

    // Keep the auto-created Live Match Observation self-describing after an
    // approved correction. A missing link is fine; a failed update is surfaced
    // to the caller without undoing the saved report.
    const { error: interactionError } = await supabaseAdmin
      .from("interactions")
      .update({
        notes: matchReportInteractionNotes({
          opponent: saved.report.opponent ?? "",
          competition: saved.report.competition ?? "",
          average,
          comments,
        }),
        updated_by: userId,
      })
      .eq("match_report_id", saved.report.report_id)
      .is("deleted_at", null);

    if (interactionError) {
      console.error(
        "[match-reports] interaction refresh after report edit failed:",
        interactionError,
      );
    }

    return {
      updated: true,
      report: saved.report,
      ...(interactionError ? { interaction_error: interactionError.message } : {}),
    };
  });

// ---------------------------------------------------------------------------
// deleteMatchReport — tombstones the canonical Supabase report.
//
// The Google Sheet archive is deliberately NOT touched: it is a rollback
// source, and destroying archived history is never part of a delete. Because
// Supabase ids are stable (they never reindex the way sheet-order occurrence
// ids did), a delete can no longer shift another report's identity, so the
// ambiguous read-back dance the sheet required is gone.
// ---------------------------------------------------------------------------

export const deleteMatchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ reportId: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Only privileged roles may delete reports.
    const roles = await getUserRoles(supabase, userId);
    if (!hasAnyRole(roles, REPORT_MANAGE_ROLES)) {
      throw new Error("You don't have permission to delete reports.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { softDeleteCanonicalReport } = await import("./store.server");

    // Tombstone the canonical report. Resolution accepts the exact id, the base
    // id of an occurrence, or the legacy identity — the same rules as reads.
    const removed = await softDeleteCanonicalReport(supabaseAdmin, data.reportId);
    if (!removed.deleted) {
      return { deleted: false, reason: "not_found" as const };
    }

    // The report's Live Match Observation is a derived record, not a separate
    // user action. Withdraw it from active interaction views while retaining
    // the source row, audit history and media links under the same tombstone
    // semantics as a direct Super Admin interaction deletion.
    const interactionDeletedAt = new Date().toISOString();
    const { error: interactionError } = await supabaseAdmin
      .from("interactions")
      .update({
        deleted_at: interactionDeletedAt,
        deleted_by: userId,
        updated_by: userId,
      })
      .eq("match_report_id", removed.report_id as string)
      .is("deleted_at", null);
    if (interactionError) {
      console.error(
        "[match-reports] linked interaction cleanup after delete failed:",
        interactionError,
      );
    }

    // Release this report's ledger records so the fixture can be submitted
    // again. Only this exact occurrence is affected — ids never reindex.
    const { error: ledgerError } = await supabaseAdmin
      .from("match_report_submissions")
      .delete()
      .eq("report_id", removed.report_id as string);
    if (ledgerError) {
      console.error("[match-reports] ledger cleanup after delete failed:", ledgerError);
    }

    return {
      deleted: true,
      row_index: removed.row_index ?? -1,
      verified: true,
      ...(interactionError ? { interaction_error: interactionError.message } : {}),
      ...(ledgerError ? { ledger_error: ledgerError.message } : {}),
    };
  });
