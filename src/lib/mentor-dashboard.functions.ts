import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { goalkeepers, calendarEvents, mentors } from "@/lib/mock-data";
import type { TierLevel } from "@/lib/mock-data";
import { parseSheetRows } from "@/lib/match-reports/schema";
import {
  countCanonicalReportsForCoach,
  FALLBACK_MENTOR_ID,
  resolveCoachIdentity,
  selectCoachProfileForDashboard,
  type DashboardCoachProfile,
} from "@/lib/mentor-dashboard-report-count";
import { DASHBOARD_INTERACTION_TYPES } from "@/lib/interactions/schema";

export type UpcomingPlannedType =
  | "Coffee Catch Up"
  | "Attend Live Match"
  | "Training Ground Visit"
  | string;

export interface MentorUpcomingInteraction {
  id: string;
  date: string;
  title: string;
  type: string;
  plannedType: UpcomingPlannedType | null;
  gkId: string | null;
  gkName: string | null;
  gkInitials: string | null;
  gkStatus: string | null;
  gkTierLevel: TierLevel | null;
  gkClub: string | null;
  gkLeague: string | null;
  gkFreeAgent: boolean;
}

export type OutstandingActionKind = "missing_report" | "missing_clip";

export interface OutstandingActionItem {
  id: string;
  kind: OutstandingActionKind;
  label: string;
  observationId: string;
  observationDate: string;
  dueDate: string;
  daysOverdue: number;
  gkId: string | null;
  gkName: string | null;
  gkInitials: string | null;
  gkStatus: string | null;
  gkTierLevel: TierLevel | null;
  gkClub: string | null;
  actionableBy: string;
  actionableByRole: "self" | "mentor" | "admin";
}

export interface MentorDashboardStats {
  mentorProfileId: string | null;
  coachIdentity: string;
  reportsLast14: number;
  interactionsLast14: number;
  clipsLast14: number;
  outstandingActions: number;
  outstandingItems: OutstandingActionItem[];
  upcomingList: MentorUpcomingInteraction[];
  lastUpdatedAt: string;
}

// Map calendar event types to the supported in-person planned interaction
// types the pilot brief lists. Falls back to the original label when no
// clean mapping exists.
function mapPlannedType(type: string): UpcomingPlannedType | null {
  switch (type) {
    case "Match":
    case "Observation":
      return "Attend Live Match";
    case "Mentor Visit":
      return "Training Ground Visit";
    case "Meeting":
      return "Coffee Catch Up";
    default:
      return null;
  }
}

/**
 * Server-side mentor dashboard aggregation.
 *
 * Stats are scoped to the signed-in mentor's OWN submissions and calendar,
 * not to a roster of assigned goalkeepers. Mentors work collaboratively
 * across the whole RPM roster.
 */
const dashboardInputSchema = z
  .object({
    days: z.coerce.number().int().min(1).max(60).default(14),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    // Local calendar days for the same window. Used for `date` columns so the
    // window never shifts by a day for non-UTC users.
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((period) => new Date(period.from).getTime() <= new Date(period.to).getTime(), {
    message: "The reporting period must end after it starts.",
  });


export const getMentorDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => dashboardInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<MentorDashboardStats> => {
    const { supabase, userId } = context;

    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("mentor_id,name,email")
        .eq("id", userId)
        .maybeSingle<DashboardCoachProfile & { mentor_id: string | null }>(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    let mentorId = profile?.mentor_id ?? null;
    const usingSuperAdminFallbackMentor =
      !mentorId && (roles ?? []).some((r) => r.role === "super_admin");

    // Allow super admins previewing the mentor view to see populated data.
    if (usingSuperAdminFallbackMentor) {
      mentorId = FALLBACK_MENTOR_ID;
    }

    const days = data.days;
    const now = Date.now();
    const inRange = now + days * 86400000;
    // `occurred_at`/`match_date` are DATE columns: compare them against the
    // caller's local calendar days, not the UTC slice of the instant.
    const periodFrom = data.fromDate ?? data.from.slice(0, 10);
    const periodTo = data.toDate ?? data.to.slice(0, 10);
    const thirtyDaysAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);

    // Real, durable activity for the signed-in user. These are the numbers the
    // dashboard cards claim to show, so they are read from the database rather
    // than from any sample data.
    const [{ data: periodInteractions }, { data: observationRows }, { data: clipRows }] =
      await Promise.all([
        supabase
          .from("interactions")
          .select("id")
          .eq("mentor_id", userId)
          .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
          .gte("occurred_at", periodFrom)
          .lte("occurred_at", periodTo),
        supabase
          .from("interactions")
          .select("id, goalkeeper_name, gk_slug, player_id, occurred_at, interaction_type")
          .eq("mentor_id", userId)
          .eq("interaction_type", "Live Match Observation")
          .gte("occurred_at", thirtyDaysAgo),
        supabase
          .from("media_assets")
          .select("id, gk_id, media_type, created_at")
          .eq("uploaded_by_id", userId)
          .eq("media_type", "video")
          .gte("created_at", data.from)
          .lte("created_at", data.to),
      ]);

    const interactionsLast14 = periodInteractions?.length ?? 0;
    const clipsLast14 = clipRows?.length ?? 0;

    // Every clip this user has uploaded, used to decide whether an observation
    // still needs follow-up media.
    const { data: allClipRows } = await supabase
      .from("media_assets")
      .select("gk_id, created_at")
      .eq("uploaded_by_id", userId)
      .eq("media_type", "video");

    const { data: fallbackMentorProfile } = usingSuperAdminFallbackMentor
      ? await supabase
          .from("profiles")
          .select("name,email")
          .eq("mentor_id", FALLBACK_MENTOR_ID)
          .maybeSingle<DashboardCoachProfile>()
      : { data: null };
    const coachIdentity = resolveCoachIdentity(
      selectCoachProfileForDashboard(
        profile ?? null,
        fallbackMentorProfile ?? null,
        usingSuperAdminFallbackMentor,
      ),
    );

    // Match Reports are read from the same canonical Sheets pipeline as the
    // report centre, then scoped to the authenticated coach identity.
    let reportsLast14 = 0;
    let coachReports: { goalkeeper: string; match_date: string | null }[] = [];
    if (coachIdentity) {
      const { readAllRows } = await import("@/lib/match-reports/sheets.server");
      const { rows, firstDataRow } = await readAllRows();
      const parsed = parseSheetRows(rows, firstDataRow);
      // Same calendar-day window as the Interactions card.
      reportsLast14 = countCanonicalReportsForCoach(parsed, coachIdentity, periodFrom, periodTo);
      const needle = coachIdentity.trim().toLowerCase();
      coachReports = parsed
        .filter((r) => (r.coach ?? "").trim().toLowerCase() === needle)
        .map((r) => ({ goalkeeper: r.goalkeeper, match_date: r.match_date }));
    }

    if (!mentorId) {
      return {
        mentorProfileId: null,
        coachIdentity,
        reportsLast14,
        interactionsLast14,
        clipsLast14,
        outstandingActions: 0,
        outstandingItems: [],
        upcomingList: [],
        lastUpdatedAt: new Date().toISOString(),
      };
    }

    const gkById = new Map(goalkeepers.map((g) => [g.id, g]));

    // Outstanding actions: live match observations logged by this user in the
    // last 30 days that lack either a follow-up match report or a matching
    // video clip within ±3 days of the observation date.
    const mentorObservations = (observationRows ?? []).filter(
      (i) => +new Date(i.occurred_at) <= now - 3 * 86400000,
    );
    const within3d = (a: string, b: string) =>
      Math.abs(+new Date(a) - +new Date(b)) <= 3 * 86400000;


    const outstandingItems: OutstandingActionItem[] = [];
    const mentorDisplay = mentors.find((m) => m.id === mentorId)?.name ?? "You";
    for (const obs of mentorObservations) {
      const gkNameKey = (obs.goalkeeper_name ?? "").trim().toLowerCase();
      const hasReport = coachReports.some(
        (r) =>
          (r.goalkeeper ?? "").trim().toLowerCase() === gkNameKey &&
          r.match_date != null &&
          within3d(r.match_date, obs.occurred_at),
      );
      const hasClip = (allClipRows ?? []).some(
        (m) => m.gk_id === obs.gk_slug && within3d(m.created_at, obs.occurred_at),
      );
      const gk = obs.gk_slug ? gkById.get(obs.gk_slug) ?? null : null;
      const due = +new Date(obs.occurred_at) + 3 * 86400000;
      const daysOverdue = Math.max(0, Math.floor((now - due) / 86400000));
      const base = {
        observationId: obs.id,
        observationDate: obs.occurred_at,

        dueDate: new Date(due).toISOString(),
        daysOverdue,
        gkId: gk?.id ?? obs.gk_slug ?? null,
        gkName: gk?.name ?? obs.goalkeeper_name ?? null,
        gkInitials: gk?.initials ?? null,
        gkStatus: gk?.status ?? null,
        gkTierLevel: gk?.tierLevel ?? null,
        gkClub: gk?.club ?? null,
        actionableBy: mentorDisplay,
        actionableByRole: "self" as const,
      };
      if (!hasReport) {
        outstandingItems.push({
          ...base,
          id: `${obs.id}:report`,
          kind: "missing_report",
          label: `Submit match report for ${gk?.name ?? obs.goalkeeper_name ?? "goalkeeper"}`,
        });
      }
      if (!hasClip) {
        outstandingItems.push({
          ...base,
          id: `${obs.id}:clip`,
          kind: "missing_clip",
          label: `Upload match clip for ${gk?.name ?? obs.goalkeeper_name ?? "goalkeeper"}`,
        });
      }
    }
    outstandingItems.sort((a, b) => b.daysOverdue - a.daysOverdue);
    const outstandingActions = outstandingItems.length;

    // Upcoming interactions: this mentor's calendar in the next 14 days.
    const upcomingEvents = calendarEvents
      .filter((e) => e.mentorId === mentorId && +new Date(e.date) >= now && +new Date(e.date) <= inRange)
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));

    const upcomingList: MentorUpcomingInteraction[] = upcomingEvents.map((e) => {
      const gk = e.gkId ? gkById.get(e.gkId) ?? null : null;
      return {
        id: e.id,
        date: e.date,
        title: e.title,
        type: e.type,
        plannedType: mapPlannedType(e.type),
        gkId: gk?.id ?? null,
        gkName: gk?.name ?? null,

        gkInitials: gk?.initials ?? null,
        gkStatus: gk?.status ?? null,
        gkTierLevel: gk?.tierLevel ?? null,
        gkClub: gk?.club ?? null,
        gkLeague: gk?.league ?? null,
        gkFreeAgent: gk?.status === "Free Agent",
      };
    });

    return {
      mentorProfileId: mentorId,
      coachIdentity,
      reportsLast14,
      interactionsLast14,
      clipsLast14,
      outstandingActions,
      outstandingItems,
      upcomingList,
      lastUpdatedAt: new Date().toISOString(),
    };
  });
