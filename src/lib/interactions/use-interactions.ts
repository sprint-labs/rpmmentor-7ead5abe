import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInteractions } from "@/lib/interactions.functions";
import type { LoggedInteraction } from "@/lib/interactions/schema";

export const interactionsQueryKey = ["interactions", "logged"] as const;

/**
 * Single shared client cache for durable interactions, so the Interactions
 * log, the dashboard and goalkeeper profiles all read the same rows and all
 * refresh together after a new interaction is saved.
 */
export function useLoggedInteractions(enabled = true) {
  const fetchInteractions = useServerFn(listInteractions);
  return useQuery<LoggedInteraction[]>({
    queryKey: interactionsQueryKey,
    queryFn: () => fetchInteractions(),
    enabled,
    staleTime: 30_000,
  });
}
