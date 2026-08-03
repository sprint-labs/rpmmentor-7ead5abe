import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { goalkeepers, interactions, reports, media, calendarEvents, mentors } from "@/lib/mock-data";
import type { TierLevel } from "@/lib/mock-data";
import { parseSheetRows } from "@/lib/match-reports/schema";
import {
  countCanonicalReportsForCoach,
  FALLBACK_MENTOR_ID,
  resolveCoachIdentity,
  selectCoachProfileForDashboard,
  type DashboardCoachProfile,
} from "@/lib/mentor-dashboard-report-count";

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
    const ago14 = now - 14 * 86400000;

    if (!mentorId) {
      return {
        mentorProfileId: null,
        coachIdentity: "",
        reportsLast14: 0,
        interactionsLast14: 0,
        clipsLast14: 0,
        outstandingActions: 0,
        outstandingItems: [],
        upcomingList: [],
        lastUpdatedAt: new Date().toISOString(),
      };
    }

    const mentorName = mentors.find((m) => m.id === mentorId)?.name;
    const gkById = new Map(goalkeepers.map((g) => [g.id, g]));

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
    if (coachIdentity) {
      const { readAllRows } = await import("@/lib/match-reports/sheets.server");
      const { rows, firstDataRow } = await readAllRows();
      reportsLast14 = countCanonicalReportsForCoach(
        parseSheetRows(rows, firstDataRow),
        coachIdentity,
        data.from,
        data.to,
      );
    }

    const mentorInteractions14 = interactions.filter(
      (i) => i.mentorId === mentorId && +new Date(i.date) >= ago14 && +new Date(i.date) <= now,
    );
    const interactionsLast14 = mentorInteractions14.length;

    const clipsLast14 = media.filter(
      (m) =>
        m.kind === "video" &&
        (mentorName ? m.uploadedBy === mentorName : false) &&
        +new Date(m.date) >= ago14 &&
        +new Date(m.date) <= now,
    ).length;

    // Outstanding actions: live match observations logged by this mentor
    // in the last 30 days that lack either a follow-up match report or a
    // matching video clip within ±3 days of the observation date.
    const mentorObservations = interactions.filter(
      (i) =>
        i.mentorId === mentorId &&
        i.type === "Live Match Observation" &&
        +new Date(i.date) >= now - 30 * 86400000 &&
        +new Date(i.date) <= now - 3 * 86400000,
    );
    const mentorReports = reports.filter((r) => r.authorId === mentorId);
    const mentorClips = media.filter(
      (m) => m.kind === "video" && (mentorName ? m.uploadedBy === mentorName : false),
    );
    const within3d = (a: string, b: string) =>
      Math.abs(+new Date(a) - +new Date(b)) <= 3 * 86400000;

    const outstandingItems: OutstandingActionItem[] = [];
    const mentorDisplay = mentors.find((m) => m.id === mentorId)?.name ?? "You";
    for (const obs of mentorObservations) {
      const hasReport = mentorReports.some(
        (r) => r.gkId === obs.gkId && within3d(r.date, obs.date),
      );
      const hasClip = mentorClips.some(
        (m) => m.gkId === obs.gkId && within3d(m.date, obs.date),
      );
      const gk = obs.gkId ? gkById.get(obs.gkId) ?? null : null;
      const due = +new Date(obs.date) + 3 * 86400000;
      const daysOverdue = Math.max(0, Math.floor((now - due) / 86400000));
      const base = {
        observationId: obs.id,
        observationDate: obs.date,
        dueDate: new Date(due).toISOString(),
        daysOverdue,
        gkId: gk?.id ?? null,
        gkName: gk?.name ?? null,
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
          label: `Submit match report for ${gk?.name ?? "goalkeeper"}`,
        });
      }
      if (!hasClip) {
        outstandingItems.push({
          ...base,
          id: `${obs.id}:clip`,
          kind: "missing_clip",
          label: `Upload match clip for ${gk?.name ?? "goalkeeper"}`,
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
