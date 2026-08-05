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

/**
 * Everything that reflects an interaction: the interactions log (shared cache
 * and paged queries), the dashboard Recent Activity card, goalkeeper profile
 * timelines, and the mentor dashboard stats that drive Duty of Care.
 */
export async function refreshInteractionViews(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: interactionsQueryKey }),
    queryClient.invalidateQueries({ queryKey: ["interactions", "page"] }),
    queryClient.invalidateQueries({ queryKey: ["mentor-dashboard-stats"] }),
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
