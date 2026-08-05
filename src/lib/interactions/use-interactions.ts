import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listInteractions, listInteractionsPage } from "@/lib/interactions.functions";
import type {
  InteractionsPage,
  ListInteractionsQuery,
  LoggedInteraction,
} from "@/lib/interactions/schema";
import type { DutySourceInteraction } from "@/lib/mock-data";

export const interactionsQueryKey = ["interactions", "logged"] as const;

/**
 * True only once a real Supabase session exists in the browser, so the
 * protected `listInteractions` server function is never called during SSR /
 * prerender or by a signed-out preview (which would 401 with
 * "No authorization header provided").
 */
export function useHasSupabaseSession(): boolean {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setHasSession(Boolean(data.session?.access_token));
      })
      .catch(() => {
        if (!cancelled) setHasSession(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!cancelled) setHasSession(Boolean(session?.access_token));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return hasSession;
}

/**
 * Single shared client cache for durable interactions, so the Interactions
 * log, the dashboard and goalkeeper profiles all read the same rows and all
 * refresh together after a new interaction is saved.
 *
 * The query only runs once an authenticated session is confirmed client-side;
 * the bearer token is then attached by the Start function middleware.
 */
export function useLoggedInteractions(enabled = true) {
  const fetchInteractions = useServerFn(listInteractions);
  const hasSession = useHasSupabaseSession();
  return useQuery<LoggedInteraction[]>({
    queryKey: interactionsQueryKey,
    queryFn: () => fetchInteractions(),
    enabled: enabled && hasSession,
    staleTime: 30_000,
    retry: false,
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

/**
 * One page of server-filtered interactions. Filters and paging are executed
 * in Postgres; previous page data is kept while the next page loads so the
 * table does not flash empty.
 */
export function useInteractionsPage(params: ListInteractionsQuery) {
  const fetchPage = useServerFn(listInteractionsPage);
  const hasSession = useHasSupabaseSession();
  return useQuery<InteractionsPage>({
    queryKey: ["interactions", "page", params],
    queryFn: () => fetchPage({ data: params }),
    enabled: hasSession,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    retry: false,
  });
}
