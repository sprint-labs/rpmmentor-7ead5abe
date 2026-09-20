import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DASHBOARD_INTERACTION_TYPES } from "@/lib/interactions/schema";
import { getActiveMentorCount } from "@/lib/active-mentors";
import { requireExactDashboardCount } from "@/lib/dashboard-count";
import { OVERVIEW_DASHBOARD_ROLES, requireRole } from "@/lib/roles.server";

export interface OverviewDashboardStats {
  /** Canonical player records — public.players. */
  totalGoalkeepers: number;
  /** Interactions logged across the whole team in the selected period. */
  interactionsInPeriod: number;
  /** Distinct accounts with mentor access (mentor or mentor_manager). */
  activeMentors: number;
  /**
   * When `public.match_reports_cache` last took a delivery from its upstream,
   * or null when the store is empty or unreadable.
   *
   * This is the freshness of the match-report STORE, not of the figures on the
   * dashboard — those are only as current as the browser's last read. The two
   * are surfaced separately for that reason; see `@/lib/data-freshness`.
   *
   * Deliberately not sourced from `sheets-status.functions.ts`, which looks
   * like it already answers this but filters to Google-Sheet-sourced rows only,
   * and so reports a date weeks older than the store's real last write.
   */
  reportsSyncedAt: string | null;
  /**
   * When the server answered this request. NOT a freshness measure: it is
   * stamped microseconds before it is formatted, so anything rendering it
   * relatively can only ever say "just now".
   */
  lastUpdatedAt: string;
}

const overviewInputSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Live counts for the non-mentor overview KPI cards. Uses exactly the same
 * `occurred_at` day window as the mentor Interactions card so the two
 * dashboards never disagree.
 */
export const getOverviewDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => overviewInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<OverviewDashboardStats> => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, OVERVIEW_DASHBOARD_ROLES, "view the management dashboard");

    const [players, periodInteractions, activeMentors, lastSync] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
        .gte("occurred_at", data.fromDate)
        .lte("occurred_at", data.toDate),
      getActiveMentorCount(supabase),
      // Newest delivery into the match-report store. One row ordered on an
      // indexed column, so it costs nothing beside the counts above.
      supabase
        .from("match_reports_cache")
        .select("synced_at")
        .is("deleted_at", null)
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const totalGoalkeepers = requireExactDashboardCount(players, "goalkeeper count");
    const interactionsInPeriod = requireExactDashboardCount(
      periodInteractions,
      "interaction count",
    );

    return {
      totalGoalkeepers,
      interactionsInPeriod,
      activeMentors,
      // A failed freshness read must not take the three counts beside it down,
      // so this reports null and the header says the time is unavailable
      // rather than blanking the whole KPI strip.
      reportsSyncedAt: lastSync.error ? null : (lastSync.data?.synced_at ?? null),
      lastUpdatedAt: new Date().toISOString(),
    };
  });
