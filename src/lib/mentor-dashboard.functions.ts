import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { goalkeepers } from "@/lib/mock-data";
import type { TierLevel } from "@/lib/mock-data";
import {
  countCanonicalReportsForCoach,
  requireCoachIdentity,
  selectCoachProfileForDashboard,
  type DashboardCoachProfile,
} from "@/lib/mentor-dashboard-report-count";
import {
  mapUpcomingCalendarEvents,
  upcomingWindow,
  UPCOMING_EVENTS_LIMIT,
  type MentorUpcomingInteraction,
} from "@/lib/mentor-upcoming-events";
import { DASHBOARD_INTERACTION_TYPES } from "@/lib/interactions/schema";
import { requireExactDashboardCount } from "@/lib/dashboard-count";
import { inclusiveDatePeriodStart } from "@/lib/dashboard-period";

export type { MentorUpcomingInteraction, UpcomingPlannedType } from "@/lib/mentor-upcoming-events";

export type OutstandingActionKind = "missing_report" | "missing_clip";

export interface OutstandingActionItem {
  id: string;
  kind: OutstandingActionKind;
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
  outstandingActions: number;
  outstandingItems: OutstandingActionItem[];
  outstandingAvailable: boolean;
  upcomingList: MentorUpcomingInteraction[];
  upcomingAvailable: boolean;
  lastUpdatedAt: string;
}

/**
 * Server-side mentor dashboard aggregation.
 *
 * Activity stats are scoped to the signed-in mentor's OWN submissions, not to
 * a roster of assigned goalkeepers — mentors work collaboratively across the
 * whole RPM roster. Upcoming events are this mentor's diary: rows whose
 * `assigned_mentor_id` is the signed-in profile, inside the forward window.
 * Events scheduled before mentors were assignable have a null assignee and
 * do not appear here until they are reassigned on `/calendar`.
 */
const dashboardInputSchema = z
  .object({
    days: z.coerce.number().int().min(1).max(60).default(14),
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    // Local calendar days for the same window. Used for `date` columns so the
    // window never shifts by a day for non-UTC users.
    fromDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    toDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((period) => new Date(period.from).getTime() <= new Date(period.to).getTime(), {
    message: "The reporting period must end after it starts.",
  });

export const getMentorDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data) => dashboardInputSchema.parse(data))
  .handler(async ({ context, data }): Promise<MentorDashboardStats> => {
    const { supabase, userId } = context;

    const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("mentor_id,name,email")
          .eq("id", userId)
          .maybeSingle<DashboardCoachProfile & { mentor_id: string | null }>(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
      ]);
    if (profileError || rolesError) {
      throw new Error("Could not load your dashboard identity.");
    }
    if (!profile) {
      throw new Error("Your dashboard identity was unavailable.");
    }

    // The caller's own legacy mentor id, or none. There is no substitute.
    //
    // A super admin previewing the mentor view used to be handed the seeded
    // identifier `m-david-rouse`, on the reasoning that it would "see populated
    // data". What it actually did was look up a person who does not exist in
    // `public.profiles` — `mentor_id` is NULL on every production profile — and
    // throw, so the preview rendered "Your dashboard didn't load." every time.
    // It also named the seed's mentor in the outstanding-actions copy.
    //
    // A previewing admin now sees their own identity. With no mentor id the
    // outstanding-actions panel reports itself unavailable, which is the honest
    // answer, rather than inventing someone else's work.
    const mentorId = profile?.mentor_id ?? null;

    const days = data.days;
    const now = Date.now();
    // `occurred_at`/`match_date` are DATE columns: compare them against the
    // caller's local calendar days, not the UTC slice of the instant.
    const periodFrom = data.fromDate ?? data.from.slice(0, 10);
    const periodTo = data.toDate ?? data.to.slice(0, 10);
    const thirtyDaysAgo = inclusiveDatePeriodStart(periodTo, 30);
    // The caller's local today is the upper bound of the backward window, and
    // the lower bound of the forward one the upcoming list needs.
    const upcoming = upcomingWindow(periodTo, days);

    // Real, durable activity for the signed-in user. These are the numbers the
    // dashboard cards claim to show, so they are read from the database rather
    // than from any sample data.
    const [periodInteractions, observations, upcomingEvents] = await Promise.all([
      supabase
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .eq("mentor_id", userId)
        .is("deleted_at", null)
        .in("interaction_type", [...DASHBOARD_INTERACTION_TYPES])
        .gte("occurred_at", periodFrom)
        .lte("occurred_at", periodTo),
      supabase
        .from("interactions")
        .select("id, goalkeeper_name, gk_slug, player_id, occurred_at, interaction_type")
        .eq("mentor_id", userId)
        .is("deleted_at", null)
        .eq("interaction_type", "Live Match Observation")
        .gte("occurred_at", thirtyDaysAgo),
      // Events a manager has booked this mentor in to attend, bounded to the
      // forward window so this never reads the whole table. Scoped by the
      // assigned profile, so a mentor sees their own diary rather than the
      // whole team's. Cancelled fixtures are dropped so this list matches the
      // month grid above it. Events scheduled before mentors were assignable
      // have no assignee and therefore reach nobody: they need reassigning on
      // `/calendar` to reappear here.
      supabase
        .from("calendar_events")
        .select("id, title, event_type, event_date, start_time, goalkeeper_name, status")
        .eq("assigned_mentor_id", userId)
        .neq("status", "cancelled")
        .gte("event_date", upcoming.fromDate)
        .lte("event_date", upcoming.toDate)
        .order("event_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: true })
        .limit(UPCOMING_EVENTS_LIMIT),
    ]);

    const interactionsLast14 = requireExactDashboardCount(
      periodInteractions,
      "personal interaction count",
    );

    // This is where the preview actually broke. The lookup above searched
    // `profiles` for the seeded `mentor_id`, found nothing — the column is NULL
    // on every production profile — and `requireCoachIdentity(null)` then threw,
    // which is the "Your dashboard didn't load." a previewing admin saw.
    //
    // The caller's own profile is the identity, always.
    const coachIdentity = requireCoachIdentity(profile ?? null);

    // Match Reports are read from the same canonical Supabase store as the
    // report centre, then scoped to the authenticated coach identity.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listCanonicalReports } = await import("@/lib/match-reports/store.server");
    // Every clip this user has uploaded is optional panel data used only to
    // decide whether an observed match still needs follow-up media.
    const [parsed, allClips] = await Promise.all([
      listCanonicalReports(supabaseAdmin),
      supabase
        .from("media_assets")
        .select("gk_id, created_at")
        .eq("uploaded_by_id", userId)
        .eq("media_type", "video"),
    ]);
    // Same calendar-day window as the Interactions card.
    const reportsLast14 = countCanonicalReportsForCoach(
      parsed,
      coachIdentity,
      periodFrom,
      periodTo,
    );
    const needle = coachIdentity.trim().toLowerCase();
    const coachReports = parsed
      .filter((r) => (r.coach ?? "").trim().toLowerCase() === needle)
      .map((r) => ({ goalkeeper: r.goalkeeper, match_date: r.match_date }));

    // Optional panels fail independently, so a calendar/media outage cannot
    // blank otherwise valid report and interaction KPI cards.
    const upcomingAvailable = !upcomingEvents.error;
    const upcomingList = upcomingAvailable
      ? mapUpcomingCalendarEvents(upcomingEvents.data ?? [], goalkeepers)
      : [];
    const outstandingAvailable = Boolean(mentorId) && !observations.error && !allClips.error;

    const gkById = new Map(goalkeepers.map((g) => [g.id, g]));

    // Outstanding actions: live match observations logged by this user in the
    // last 30 days that lack either a follow-up match report or a matching
    // video clip within ±3 days of the observation date.
    const mentorObservations = (outstandingAvailable ? (observations.data ?? []) : []).filter(
      (i) => +new Date(i.occurred_at) <= now - 3 * 86400000,
    );
    const within3d = (a: string, b: string) =>
      Math.abs(+new Date(a) - +new Date(b)) <= 3 * 86400000;

    const outstandingItems: OutstandingActionItem[] = [];
    // The signed-in person, from their own profile row — not a name looked up
    // in the seed by an identifier that is NULL in production anyway.
    const mentorDisplay = profile?.name?.trim() || "You";
    for (const obs of mentorObservations) {
      const gkNameKey = (obs.goalkeeper_name ?? "").trim().toLowerCase();
      const hasReport = coachReports.some(
        (r) =>
          (r.goalkeeper ?? "").trim().toLowerCase() === gkNameKey &&
          r.match_date != null &&
          within3d(r.match_date, obs.occurred_at),
      );
      const hasClip = (allClips.data ?? []).some(
        (m) => m.gk_id === obs.gk_slug && within3d(m.created_at, obs.occurred_at),
      );
      const gk = obs.gk_slug ? (gkById.get(obs.gk_slug) ?? null) : null;
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
        });
      }
      if (!hasClip) {
        outstandingItems.push({
          ...base,
          id: `${obs.id}:clip`,
          kind: "missing_clip",
        });
      }
    }
    outstandingItems.sort((a, b) => b.daysOverdue - a.daysOverdue);
    const outstandingActions = outstandingItems.length;

    return {
      mentorProfileId: mentorId,
      coachIdentity,
      reportsLast14,
      interactionsLast14,
      outstandingActions,
      outstandingItems,
      outstandingAvailable,
      upcomingList,
      upcomingAvailable,
      lastUpdatedAt: new Date().toISOString(),
    };
  });
