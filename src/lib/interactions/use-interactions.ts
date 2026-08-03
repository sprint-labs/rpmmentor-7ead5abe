import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listInteractions } from "@/lib/interactions.functions";
import type { LoggedInteraction } from "@/lib/interactions/schema";
import type { DutySourceInteraction } from "@/lib/mock-data";

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

/**
 * Durable interactions projected into the shape duty-of-care maths needs.
 * Falls back to an empty list while loading so nothing is fabricated.
 */
export function useDutySource(): DutySourceInteraction[] {
  const { data } = useLoggedInteractions();
  return useMemo(
    () => (data ?? []).map((i) => ({ gkId: i.gkSlug, type: i.interactionType, date: i.occurredAt })),
    [data],
  );
}
