import type { MatchReportRow } from "@/lib/match-reports/schema";

export const FALLBACK_MENTOR_ID = "m-david-rouse";

export interface DashboardCoachProfile {
  name: string | null;
  email: string | null;
}

/**
 * Match the identity stamped by submitMatchReport: name first, then email.
 */
export function resolveCoachIdentity(profile: DashboardCoachProfile | null | undefined): string {
  return (profile?.name || profile?.email || "").trim();
}

export function requireCoachIdentity(profile: DashboardCoachProfile | null | undefined): string {
  const identity = resolveCoachIdentity(profile);
  if (!identity) throw new Error("Your Match Report identity was unavailable.");
  return identity;
}

/**
 * A Super Admin previewing the Mentor view represents the effective mentor,
 * rather than the Super Admin's own profile.
 */
export function selectCoachProfileForDashboard(
  callerProfile: DashboardCoachProfile | null,
  effectiveMentorProfile: DashboardCoachProfile | null,
  usingSuperAdminFallbackMentor: boolean,
): DashboardCoachProfile | null {
  return usingSuperAdminFallbackMentor ? effectiveMentorProfile : callerProfile;
}

/** Mirrors the date predicate used by the /reports route. */
export function isMatchDateInPeriod(matchDate: string | null, from: string, to: string): boolean {
  if (!matchDate) return false;
  const timestamp = new Date(matchDate).getTime();
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return Number.isFinite(timestamp) && timestamp >= start && timestamp <= end;
}

/**
 * Count the canonical rows for the same coach and literal period supplied to
 * the reports link. Coach equality deliberately mirrors /reports exactly.
 */
export function countCanonicalReportsForCoach(
  reports: MatchReportRow[],
  coachIdentity: string,
  from: string,
  to: string,
): number {
  if (!coachIdentity) return 0;
  return reports.filter(
    (report) => report.coach === coachIdentity && isMatchDateInPeriod(report.match_date, from, to),
  ).length;
}
