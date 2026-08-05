import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DASHBOARD_INTERACTION_TYPES } from "@/lib/interactions/schema";

export interface OverviewDashboardStats {
  /** Canonical player records — public.players. */
  totalGoalkeepers: number;
  /** Interactions logged across the whole team in the selected period. */
  interactionsInPeriod: number;
  /** Interactions logged by the signed-in user in the same period. */
  myInteractionsInPeriod: number;
  /** Distinct accounts holding the mentor role — public.user_roles. */
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
  .inputValidator((data) => overviewInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<OverviewDashboardStats> => {
    const { supabase, userId } = context;

    const [players, periodInteractions, myInteractions, mentorRoles] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }),
      supabase
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
        .gte("occurred_at", data.fromDate)
        .lte("occurred_at", data.toDate),
      supabase
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .eq("mentor_id", userId)
        .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
        .gte("occurred_at", data.fromDate)
        .lte("occurred_at", data.toDate),
      supabase.from("user_roles").select("user_id").eq("role", "mentor"),
    ]);

    return {
      totalGoalkeepers: players.count ?? 0,
      interactionsInPeriod: periodInteractions.count ?? 0,
      myInteractionsInPeriod: myInteractions.count ?? 0,
      activeMentors: new Set((mentorRoles.data ?? []).map((r) => r.user_id)).size,
      lastUpdatedAt: new Date().toISOString(),
    };
  });
