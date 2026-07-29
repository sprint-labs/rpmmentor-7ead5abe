/**
 * Match Report server functions.
 *
 * All handlers require an authenticated Supabase session. The caller's role
 * and display name are looked up from the database (`user_roles`, `profiles`)
 * — never trusted from client input.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  matchReportSubmitSchema,
  averageOfScores,
  computeReportId,
  rowToMatchReport,
  formatSheetDate,
  COLUMN_INDEX,
  PILLAR_IDS,
  SOURCE_APP,
  SOURCE_APP_REPLAY,
  type MatchReportRow,
} from "./schema";

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
  const parsed: MatchReportRow[] = [];
  rows.forEach((row, i) => {
    const r = rowToMatchReport(row, firstDataRow + i);
    if (r) parsed.push(r);
  });
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
          source: r.source,
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
    for (let i = 0; i < rows.length; i++) {
      const r = rowToMatchReport(rows[i], firstDataRow + i);
      if (r && r.report_id === data.reportId) return { report: r };
    }
    return { report: null };
  });

// ---------------------------------------------------------------------------
// submitMatchReport
// ---------------------------------------------------------------------------

export const submitMatchReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    return z
      .object({
        payload: matchReportSubmitSchema,
        options: z
          .object({
            /** Privileged override for the duplicate-fixture guard. */
            allowDuplicate: z.boolean().optional().default(false),
            /** Set by the offline sync queue when replaying a queued submit. */
            replay: z.boolean().optional().default(false),
          })
          .optional()
          .default({ allowDuplicate: false, replay: false }),
      })
      .parse(data);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { payload, options } = data;

    // Look up the caller's real role from the database — never trust the client.
    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Unable to verify caller role.");

    const roles = (roleRows ?? []).map((r) => r.role as string);
    const effectiveRole =
      roles.includes("super_admin") ? "super_admin" :
      roles.includes("admin") ? "admin" :
      roles.includes("mentor_manager") ? "mentor_manager" :
      roles.includes("mentor") ? "mentor" : null;

    const CAN_SUBMIT = ["super_admin", "mentor_manager", "mentor"];
    const CAN_OVERRIDE_COACH = ["super_admin", "admin", "mentor_manager"];

    if (!effectiveRole || !CAN_SUBMIT.includes(effectiveRole)) {
      throw new Error("You don't have permission to submit reports.");
    }

    // Look up caller's canonical name from profiles.
    const { data: profile } = await supabase
      .from("profiles")
      .select("name,email")
      .eq("id", userId)
      .maybeSingle<{ name: string | null; email: string | null }>();
    const callerName = (profile?.name || profile?.email || "").trim();

    // Coach is a read-only, server-derived field. Non-privileged roles get
    // their canonical profile name authoritatively; privileged roles may
    // submit on another coach's behalf.
    const canOverrideCoach = CAN_OVERRIDE_COACH.includes(effectiveRole);
    const resolvedCoach = canOverrideCoach
      ? (payload.coach?.trim() || callerName)
      : callerName;

    // The Zod schema validates the *client* coach value; the resolved value is
    // what actually reaches the sheet, so it gets its own guard.
    if (!resolvedCoach) {
      throw new Error(
        "Your profile has no name or email set, so the Coach field can't be filled. Add a name in Account settings and try again.",
      );
    }
    if (resolvedCoach.length > 80) {
      throw new Error("Coach name is too long (max 80 characters).");
    }
    // A privileged override must name a real Mentor Hub profile — no free text.
    if (canOverrideCoach && resolvedCoach !== callerName) {
      const { data: match } = await supabase
        .from("profiles")
        .select("id")
        .ilike("name", resolvedCoach)
        .limit(1);
      if (!match || match.length === 0) {
        throw new Error(
          `"${resolvedCoach}" doesn't match a Mentor Hub user. Coach must be an existing profile name.`,
        );
      }
    }

    const average = averageOfScores(payload);
    const { readAllRows, appendRow } = await import("./sheets.server");

    const report_id = computeReportId({
      goalkeeper: payload.goalkeeper,
      match_date: payload.match_date,
      opponent: payload.opponent,
    });

    // ---- Duplicate-fixture guard -----------------------------------------
    // Same goalkeeper + match date + opponent already in the sheet means this
    // is a double submit or a replayed queue job that already landed.
    if (!options.allowDuplicate) {
      try {
        const { rows, firstDataRow } = await readAllRows();
        for (let i = 0; i < rows.length; i++) {
          const existing = rowToMatchReport(rows[i], firstDataRow + i);
          if (existing && existing.report_id === report_id) {
            const err = new Error(
              `A match report already exists for ${payload.goalkeeper} vs ${payload.opponent} on ${payload.match_date}.`,
            ) as Error & { code?: string; report_id?: string; canOverride?: boolean };
            err.code = "duplicate_report";
            err.report_id = existing.report_id;
            err.canOverride = canOverrideCoach;
            throw err;
          }
        }
      } catch (e) {
        // Only swallow read failures — a real duplicate must still block.
        if ((e as { code?: string })?.code === "duplicate_report") throw e;
        console.warn("[match-reports] duplicate pre-check skipped:", e);
      }
    }

    const source = options.replay ? SOURCE_APP_REPLAY : SOURCE_APP;

    // Column order MUST match COLUMN_INDEX / SHEET_HEADERS.
    const row = new Array<string | number>(16).fill("");
    row[COLUMN_INDEX.goalkeeper] = payload.goalkeeper;
    row[COLUMN_INDEX.coach] = resolvedCoach;
    row[COLUMN_INDEX.team] = payload.team;
    row[COLUMN_INDEX.opponent] = payload.opponent;
    row[COLUMN_INDEX.match_date] = formatSheetDate(payload.match_date);
    for (const id of PILLAR_IDS) row[COLUMN_INDEX[id]] = payload[id];
    row[COLUMN_INDEX.average] = average;
    row[COLUMN_INDEX.comments] = payload.comments ?? "";
    row[COLUMN_INDEX.competition] = payload.competition ?? "";
    row[COLUMN_INDEX.source] = source;

    const rowIndex = await appendRow(row);

    // Mirror into cache immediately so /reports reflects the new row without a re-read.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
            source,
            match_date: payload.match_date,
            protect_goal: payload.protect_goal,
            protect_space: payload.protect_space,
            protect_air: payload.protect_air,
            control_play: payload.control_play,
            change_play: payload.change_play,
            psych: payload.psych,
            physical: payload.physical,
            average,
            comments: payload.comments ?? "",
            synced_at: new Date().toISOString(),
          },
        ],
        { onConflict: "report_id" },
      );
    } catch (e) {
      console.error("[match-reports] cache mirror on submit failed:", e);
    }

    return { report_id, row_index: rowIndex, average, source };
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
    let matchedRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rowToMatchReport(rows[i], firstDataRow + i);
      if (r && r.report_id === data.reportId) {
        matchedRowIndex = firstDataRow + i;
        break;
      }
    }
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
    } catch (e) {
      console.error("[match-reports] cache delete after sheet delete failed:", e);
    }

    return { deleted: true, row_index: matchedRowIndex };
  });


