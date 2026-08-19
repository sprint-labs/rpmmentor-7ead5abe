import { splitPersonName, type UserActivityRow } from "@/lib/users-and-roles";

export interface ActiveMentorDirectoryRow {
  id: string;
  name: string;
  isManager: boolean;
}

export interface ActiveMentorInsightRow extends ActiveMentorDirectoryRow {
  firstName: string;
  lastName: string;
  matchReportsSubmitted: number;
  interactionsLogged: number;
}

/**
 * Build the drilldown from directory membership, never from the precedence-
 * collapsed display role. Activity data enriches a member but cannot add or
 * remove one, so multi-role accounts match the dashboard RPC count.
 */
export function buildActiveMentorInsightRows(
  directory: readonly ActiveMentorDirectoryRow[],
  activity: readonly UserActivityRow[],
): ActiveMentorInsightRow[] {
  const activityById = new Map(activity.map((row) => [row.id, row]));
  return directory.map((mentor) => ({
    ...mentor,
    ...splitPersonName(mentor.name),
    matchReportsSubmitted: activityById.get(mentor.id)?.matchReportsSubmitted ?? 0,
    interactionsLogged: activityById.get(mentor.id)?.interactionsLogged ?? 0,
  }));
}
