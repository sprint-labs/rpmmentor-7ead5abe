/**
 * Manual "Re-sync now" server function for Match Reports.
 *
 * This handler NEVER writes to the sheet. It reconciles `failed` reservations
 * against the live sheet and reports which ones are safe to replay; the replay
 * itself happens through the existing idempotent submit path (same
 * `submission_key`), so a retry can never append a second row.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planResync, summarise, type ResyncLedgerRow } from "./resync";

export const resyncFailedMatchReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };

    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error("Unable to verify caller role.");
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    const CAN_SUBMIT = ["super_admin", "mentor_manager", "mentor"];
    if (!roles.some((r: string) => CAN_SUBMIT.includes(r))) {
      throw new Error("You don't have permission to re-sync match reports.");
    }
    const isAdmin = roles.includes("super_admin") || roles.includes("mentor_manager");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("match_report_submissions")
      .select("id,status,submission_key,goalkeeper,team,opponent,match_date,report_id")
      .order("submitted_at", { ascending: false })
      .limit(500);
    if (!isAdmin) query = query.eq("user_id", userId);
    const { data: ledgerRows, error: ledgerErr } = await query;
    if (ledgerErr) {
      throw new Error("Could not read submission history. Nothing was changed; please try again.");
    }
    const rows = (ledgerRows ?? []) as ResyncLedgerRow[];
    if (!rows.some((r) => r.status === "failed")) {
      return {
        checked: 0,
        retryReady: 0,
        heldForReview: 0,
        retry: [] as { submission_key: string; label: string }[],
        held: [] as { submission_key: string; label: string; reason: string }[],
        message: "Nothing to re-sync — there are no failed submissions.",
      };
    }

    // Live sheet identities. A read failure must not be treated as "no rows",
    // otherwise a held attempt could be wrongly declared safe to retry.
    const { readAllRows } = await import("./sheets.server");
    const { parseSheetRows } = await import("./schema");
    const { rows: sheetRows, firstDataRow } = await readAllRows();
    const sheetReportIds = parseSheetRows(sheetRows, firstDataRow).map((r) => r.report_id);

    const decisions = planResync(rows, sheetReportIds);
    const held = decisions.filter((d) => d.outcome === "hold_for_review");

    // Reclassify unprovable attempts so they stop looking retryable anywhere.
    if (held.length) {
      const nowIso = new Date().toISOString();
      for (const d of held) {
        await supabaseAdmin
          .from("match_report_submissions")
          .update({ status: "ambiguous", updated_at: nowIso })
          .eq("id", d.id)
          .eq("status", "failed");
      }
    }

    const s = summarise(decisions);
    return {
      ...s,
      retry: decisions
        .filter((d) => d.outcome === "retry_ready")
        .map((d) => ({ submission_key: d.submission_key, label: d.label })),
      held: held.map((d) => ({ submission_key: d.submission_key, label: d.label, reason: d.reason })),
      message:
        s.retryReady === 0 && s.heldForReview === 0
          ? "Nothing to re-sync — there are no failed submissions."
          : `${s.retryReady} failed submission${s.retryReady === 1 ? "" : "s"} safe to retry, ${s.heldForReview} held for review.`,
    };
  });
