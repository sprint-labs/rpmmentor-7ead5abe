/**
 * Reads what has actually been logged, so the calendar's MISSING badges reflect
 * the database instead of an empty in-memory store.
 *
 * Read-only, and through the authenticated client rather than a privileged one:
 * `interactions` and the canonical Match Report store are both readable by
 * mentor, mentor_manager, admin and super_admin under RLS, so every role that
 * can see the calendar can already see the coverage behind these badges.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MATCH_REPORT_TYPE,
  isTrackedReportType,
  type ReportCoverageEntry,
} from "./report-coverage";

/**
 * The canonical Match Report table, named here rather than imported from
 * `match-reports/store.server.ts`: that module is server-only and works through
 * a service-role client, where this is a two-column read for display.
 */
const MATCH_REPORT_TABLE = "match_reports_cache";

/**
 * How far back to load. The calendar asks about events across the visible month
 * and each looks back 30 days, so the earliest date a badge can consult is about
 * two months behind today. 120 days covers that with room to spare.
 */
const LOOKBACK_DAYS = 120;

/**
 * Ample for the window above. Both reads are ordered newest first so that if the
 * cap is ever reached, the rows dropped are the oldest — the ones least likely to
 * fall inside a badge's 30-day window. An unordered limit would drop an arbitrary
 * subset instead, and recent coverage could silently read as missing.
 */
const ROW_LIMIT = 2000;

export const listReportCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReportCoverageEntry[]> => {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);

    const [interactions, reports] = await Promise.all([
      context.supabase
        .from("interactions")
        .select("player_id, gk_slug, goalkeeper_name, interaction_type, occurred_at")
        .is("deleted_at", null)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(ROW_LIMIT),
      context.supabase
        .from(MATCH_REPORT_TABLE)
        // A soft-deleted report is not coverage; it is a report that was withdrawn.
        .select("goalkeeper, match_date")
        .is("deleted_at", null)
        .gte("match_date", since)
        .order("match_date", { ascending: false })
        .limit(ROW_LIMIT),
    ]);
    if (interactions.error) throw new Error(interactions.error.message);
    if (reports.error) throw new Error(reports.error.message);

    const entries: ReportCoverageEntry[] = [];

    for (const row of interactions.data ?? []) {
      const type = String(row.interaction_type ?? "");
      const occurredOn = String(row.occurred_at ?? "").slice(0, 10);
      if (!occurredOn || !isTrackedReportType(type)) continue;
      entries.push({
        type,
        playerId: row.player_id ?? null,
        gkSlug: row.gk_slug ?? null,
        goalkeeperName: row.goalkeeper_name ?? null,
        occurredOn,
      });
    }

    for (const row of reports.data ?? []) {
      const occurredOn = String(row.match_date ?? "").slice(0, 10);
      if (!occurredOn) continue;
      entries.push({
        type: MATCH_REPORT_TYPE,
        // The canonical store identifies a goalkeeper by name and holds no
        // player id, so name matching is the only route available here.
        playerId: null,
        gkSlug: null,
        goalkeeperName: row.goalkeeper ?? null,
        occurredOn,
      });
    }

    return entries;
  });
