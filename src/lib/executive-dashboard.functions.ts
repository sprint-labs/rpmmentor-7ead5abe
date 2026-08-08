import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { MatchReportRow } from "@/lib/match-reports/schema";
import { DASHBOARD_INTERACTION_TYPES } from "@/lib/interactions/schema";

export interface ExecutiveBar {
  label: string;
  count: number;
}

export interface ExecutiveMentorRow {
  name: string;
  interactions: number;
}

export interface ExecutiveDashboardStats {
  /** Canonical player records — public.players. */
  totalGoalkeepers: number;
  /** Distinct players observed (any interaction) inside the coverage window. */
  coveredGoalkeepers: number;
  coverageDays: number;
  /** Interactions logged across the whole team in the selected period. */
  interactionsInPeriod: number;
  /** Accounts holding the mentor role — public.user_roles. */
  activeMentors: number;
  /** Canonical Sheets match reports whose match_date falls in the period. */
  reportsInPeriod: number;
  /** Match report volume per week for the last 8 completed weeks. */
  reportWeeks: ExecutiveBar[];
  /** Interactions in period grouped by interaction_type. */
  interactionsByType: ExecutiveBar[];
  /** Match reports in period grouped by competition. */
  reportsByCompetition: ExecutiveBar[];
  /** Interactions in period grouped by mentor. */
  mentorLeaderboard: ExecutiveMentorRow[];
  lastUpdatedAt: string;
}

const executiveInputSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  coverageDays: z.coerce.number().int().min(1).max(365).default(30),
});

function tally(values: (string | null | undefined)[], fallback: string): ExecutiveBar[] {
  const map = new Map<string, number>();
  for (const raw of values) {
    const label = (raw ?? "").trim() || fallback;
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Live counts for the Executive dashboard. Every period-scoped number uses the
 * exact same local calendar-day window (`occurred_at` / `match_date`) as the
 * Interactions card on the main dashboard, so the pages never disagree.
 */
export const getExecutiveDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => executiveInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<ExecutiveDashboardStats> => {
    const { supabase } = context;

    const coverageFrom = new Date(`${data.toDate}T00:00:00`);
    coverageFrom.setDate(coverageFrom.getDate() - data.coverageDays);
    const coverageFromDate = coverageFrom.toISOString().slice(0, 10);

    const [players, periodInteractions, coverageInteractions, mentorRoles] = await Promise.all([
      supabase.from("players").select("id", { count: "exact", head: true }),
      supabase
        .from("interactions")
        .select("id, mentor_name, interaction_type")
        .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
        .gte("occurred_at", data.fromDate)
        .lte("occurred_at", data.toDate),
      supabase
        .from("interactions")
        .select("player_id, gk_slug")
        .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
        .gte("occurred_at", coverageFromDate)
        .lte("occurred_at", data.toDate),
      supabase.from("user_roles").select("user_id").eq("role", "mentor"),
    ]);

    const rowsInPeriod = periodInteractions.data ?? [];
    const covered = new Set(
      (coverageInteractions.data ?? [])
        .map((row) => row.player_id ?? row.gk_slug)
        .filter((value): value is string => Boolean(value)),
    );

    // Match Reports come from the same canonical Supabase store as /reports.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listCanonicalReports } = await import("@/lib/match-reports/store.server");
    let reports: MatchReportRow[] = [];
    try {
      reports = await listCanonicalReports(supabaseAdmin);
    } catch {
      reports = [];
    }

    const inPeriod = reports.filter(
      (r) => r.match_date != null && r.match_date >= data.fromDate && r.match_date <= data.toDate,
    );

    const weekEnd = new Date(`${data.toDate}T00:00:00`);
    const reportWeeks: ExecutiveBar[] = Array.from({ length: 8 }).map((_, i) => {
      const end = new Date(weekEnd);
      end.setDate(end.getDate() - (7 - i) * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      return {
        label: `W${i + 1}`,
        count: reports.filter(
          (r) => r.match_date != null && r.match_date >= startDate && r.match_date <= endDate,
        ).length,
      };
    });

    return {
      totalGoalkeepers: players.count ?? 0,
      coveredGoalkeepers: covered.size,
      coverageDays: data.coverageDays,
      interactionsInPeriod: rowsInPeriod.length,
      activeMentors: new Set((mentorRoles.data ?? []).map((r) => r.user_id)).size,
      reportsInPeriod: inPeriod.length,
      reportWeeks,
      interactionsByType: tally(
        rowsInPeriod.map((r) => r.interaction_type),
        "Unspecified",
      ),
      reportsByCompetition: tally(
        inPeriod.map((r) => r.competition),
        "Unspecified",
      ),
      mentorLeaderboard: tally(
        rowsInPeriod.map((r) => r.mentor_name),
        "Unknown",
      ).map((entry) => ({ name: entry.label, interactions: entry.count })),
      lastUpdatedAt: new Date().toISOString(),
    };
  });
