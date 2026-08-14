// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const listInteractionsMock = vi.fn();
let session: { access_token: string } | null = null;
let authCallback: ((evt: string, s: unknown) => void) | null = null;

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/interactions.functions", () => ({
  listInteractions: (...args: unknown[]) => listInteractionsMock(...args),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb: (evt: string, s: unknown) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  },
}));

import { useLoggedInteractions, interactionsQueryKey } from "@/lib/interactions/use-interactions";

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useLoggedInteractions auth gating", () => {
  beforeEach(() => {
    listInteractionsMock.mockReset();
    listInteractionsMock.mockResolvedValue([]);
    session = null;
    authCallback = null;
  });
  afterEach(cleanup);

  it("never calls the protected server function when signed out (no blank screen in preview)", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLoggedInteractions(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(listInteractionsMock).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("loads once a real session is confirmed, and refetches after an interaction is saved", async () => {
    session = { access_token: "token" };
    listInteractionsMock.mockResolvedValue([
      {
        id: "i1",
        gkSlug: "gk-1",
        goalkeeperName: "Demo Keeper",
        mentorId: "u1",
        mentorName: "Mentor",
        interactionType: "Coffee Catch Up",
        club: "",
        occurredAt: "2026-08-01",
        notes: "n",
        outcome: "",
        followUp: "",
        createdAt: "2026-08-01T00:00:00Z",
      },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLoggedInteractions(), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(listInteractionsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await client.invalidateQueries({ queryKey: interactionsQueryKey });
    });
    await waitFor(() => expect(listInteractionsMock).toHaveBeenCalledTimes(2));
  });

  it("starts fetching when a session arrives via onAuthStateChange", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useLoggedInteractions(), { wrapper: wrapper(client) });
    await waitFor(() => expect(authCallback).toBeTypeOf("function"));
    expect(listInteractionsMock).not.toHaveBeenCalled();

    await act(async () => {
      authCallback?.("SIGNED_IN", { access_token: "token" });
    });
    await waitFor(() => expect(listInteractionsMock).toHaveBeenCalledTimes(1));
  });

  it("stays disabled when the caller opts out (mentor dashboard view)", async () => {
    session = { access_token: "token" };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useLoggedInteractions(false), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(listInteractionsMock).not.toHaveBeenCalled();
  });
});
