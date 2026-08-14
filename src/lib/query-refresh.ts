/**
 * Shared cache-refresh helpers.
 *
 * Several surfaces read the same underlying data, so every write path has to
 * refresh the same set of queries or one view will keep showing a stale value
 * after a correction. Keeping the lists here means a new consumer only has to
 * be added in one place.
 */
import type { QueryClient } from "@tanstack/react-query";
import { interactionsQueryKey } from "@/lib/interactions/use-interactions";
import { reportCoverageQueryKey } from "@/lib/calendar/report-coverage";
import { eventFollowUpsQueryKey } from "@/lib/events/query-keys";

/**
 * Everything that reflects an interaction: the interactions log (shared cache
 * and paged queries), the attached voice recordings, the dashboard Recent
 * Activity card, goalkeeper profile timelines, the mentor dashboard stats that
 * drive Duty of Care, the calendar's missing-report badges, and the follow-up
 * statuses — a saved write-up is what turns a requirement to Completed, so the
 * status has to be re-read rather than left in cache.
 *
 * Submitting a Match Report also lands here, because it writes the report's Live
 * Match Observation interaction alongside it.
 */
export async function refreshInteractionViews(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: interactionsQueryKey }),
    queryClient.invalidateQueries({ queryKey: ["interactions", "page"] }),
    queryClient.invalidateQueries({ queryKey: ["interactions", "audio"] }),
    queryClient.invalidateQueries({ queryKey: ["mentor-dashboard-stats"] }),
    queryClient.invalidateQueries({ queryKey: reportCoverageQueryKey }),
    queryClient.invalidateQueries({ queryKey: eventFollowUpsQueryKey }),
  ]);
}

/**
 * Everything that displays a player's club: the roster list, the individual
 * player record, and the interaction/report forms that auto-fill club from the
 * roster.
 */
export async function refreshClubDependentViews(
  queryClient: QueryClient,
  playerId?: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["players", "roster"] }),
    queryClient.invalidateQueries({ queryKey: ["mentor-dashboard-stats"] }),
    ...(playerId ? [queryClient.invalidateQueries({ queryKey: ["player", playerId] })] : []),
  ]);
}

/**
 * Everything that counts or names people: the user directory, the mentor
 * pickers, every dashboard KPI (mentor counts, activity per mentor), the
 * interactions log and the shared calendar — all of which show mentor names
 * and totals that change the moment an account is deleted.
 */
export async function refreshUserDirectoryViews(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["managed-users"] }),
    queryClient.invalidateQueries({ queryKey: ["users-and-roles"] }),
    queryClient.invalidateQueries({ queryKey: ["overview-dashboard-stats"] }),
    queryClient.invalidateQueries({ queryKey: ["executive-dashboard-stats"] }),
    queryClient.invalidateQueries({ queryKey: ["mentor-dashboard-stats"] }),
    queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
    refreshInteractionViews(queryClient),
  ]);
}
