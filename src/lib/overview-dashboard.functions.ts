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

    const [players, periodInteractions, activeMentors] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabase
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
        .gte("occurred_at", data.fromDate)
        .lte("occurred_at", data.toDate),
      getActiveMentorCount(supabase),
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
      lastUpdatedAt: new Date().toISOString(),
    };
  });
