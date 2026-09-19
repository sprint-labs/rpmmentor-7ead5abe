// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { routeTree } from "../routeTree.gen";

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: {
      id: "goalkeeper-profile-test-user",
      name: "Test User",
      email: "test@example.com",
      role: "mentor",
      actualRole: "mentor",
      initials: "TU",
      title: "Test",
    },
    loading: false,
    can: (permission: string) => permission === "goalkeepers.view",
    signIn: vi.fn(),
    signOut: vi.fn(),
    setViewAsRole: vi.fn(),
  }),
}));

vi.mock("@/routes/__root", async () => {
  const React = await import("react");
  const { Outlet, createRootRouteWithContext } = await import("@tanstack/react-router");

  return {
    Route: createRootRouteWithContext()({
      component: () => React.createElement(Outlet),
    }),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("@/components/app-shell", () => ({ AppShell: () => <Outlet /> }));
vi.mock("@/lib/notifications", () => ({
  NotificationsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/theme", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  themeInitScript: "",
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/lib/pwa/register-sw", () => ({ registerSw: vi.fn() }));
vi.mock("sonner", () => ({ toast: vi.fn() }));

// The profile's media panel talks to Supabase directly rather than through a
// server function, so it is stubbed here; the rest of the module stays real.
vi.mock("@/lib/media-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media-store")>()),
  listMedia: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/match-reports/reports.functions", () => ({
  deleteMatchReport: vi.fn(),
  getMatchReport: vi.fn(),
  listMatchReports: listMatchReportsMock,
  submitMatchReport: vi.fn(),
  updateMatchReport: vi.fn(),
}));

const {
  getPlayerDutyOfCareMock,
  listMatchReportsMock,
  listPlayerDutyOfCareMock,
  listPlayersMock,
  resetDutyOfCareMock,
  APOSTROPHE_PLAYER,
  CURLY_REPORT,
  LIVE_ONLY_PLAYER,
} = vi.hoisted(() => ({
  getPlayerDutyOfCareMock: vi.fn(),
  listMatchReportsMock: vi.fn(),
  listPlayerDutyOfCareMock: vi.fn(),
  listPlayersMock: vi.fn(),
  resetDutyOfCareMock: vi.fn(),
  /**
   * A goalkeeper signed since the seed fixture was captured: present in
   * `public.players`, absent from `src/lib/mock-data.ts`. His legacy slug is
   * `gk-kwame-asante`, which is what the roster list and a duty-of-care alert
   * both link to.
   */
  LIVE_ONLY_PLAYER: {
    id: "00000000-0000-4000-8000-0000000000aa",
    full_name: "Kwame Asante",
    current_club: "Sunderland",
    parent_club: null,
    on_loan: false,
    league: "Premier League",
    nationality: "Ghana",
    instagram_url: null,
    contract_until: "June 2029",
    tier: "Tier 2",
    is_academy: false,
    is_free_agent: false,
  },
  /**
   * The apostrophe hazard, as the live database actually holds it:
   * `public.players` stores a straight `'`, `match_reports_cache` a curly one.
   */
  APOSTROPHE_PLAYER: {
    id: "00000000-0000-4000-8000-0000000000bb",
    full_name: "Rich O'Donnell",
    current_club: "Rotherham United",
    parent_club: null,
    on_loan: false,
    league: "EFL League One",
    nationality: "England",
    instagram_url: null,
    contract_until: "June 2027",
    tier: "Tier 3",
    is_academy: false,
    is_free_agent: false,
  },
  CURLY_REPORT: {
    report_id: "mr2_curly_1",
    legacy_report_id: "mr_curly_1",
    row_index: 1,
    goalkeeper: "Rich O\u2019Donnell",
    coach: "A Coach",
    team: null,
    opponent: "Barnsley",
    competition: "EFL League One",
    match_date: "2026-09-01",
    scores: {
      protect_goal: 4,
      protect_space: 4,
      protect_air: 4,
      control_play: 4,
      change_play: 4,
      psych: 4,
      physical: 4,
    },
    average: 4,
    comments: "",
  },
}));

vi.mock("@/lib/duty-of-care.functions", () => ({
  getPlayerDutyOfCare: getPlayerDutyOfCareMock,
  listPlayerDutyOfCare: listPlayerDutyOfCareMock,
  resetDutyOfCare: resetDutyOfCareMock,
}));
vi.mock("@/lib/players.functions", () => ({ listPlayers: listPlayersMock }));

// The page calls more than one server function and they answer with different
// shapes, so the stub dispatches on which one it was handed. `listPlayers` is
// delegated to its own mock so each case can choose whether the roster
// resolves, stays in flight, or fails.
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: (fn: unknown) =>
      fn === listPlayersMock
        ? () => listPlayersMock()
        : fn === listMatchReportsMock
          ? () => listMatchReportsMock()
          : fn === listPlayerDutyOfCareMock
            ? vi.fn().mockResolvedValue([])
            : fn === getPlayerDutyOfCareMock
              ? vi.fn().mockResolvedValue({ state: "green" })
              : vi.fn().mockResolvedValue({ reports: [] }),
  };
});

async function renderProfile(initialEntry: string, seed?: (queryClient: QueryClient) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  seed?.(queryClient);
  const router = createRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree,
  });

  await router.load();

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: "",
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  listPlayersMock.mockResolvedValue([LIVE_ONLY_PLAYER]);
  listMatchReportsMock.mockResolvedValue({ reports: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Goalkeeper profile page", () => {
  it("resolves a goalkeeper who exists only in the live roster", async () => {
    await renderProfile("/goalkeepers/gk-kwame-asante");

    expect(await screen.findByRole("heading", { name: "Kwame Asante" })).toBeTruthy();
    // Club and league come from the roster row, not from a seed entry.
    expect(screen.getByText(/Sunderland/)).toBeTruthy();
    expect(screen.queryByText("Goalkeeper not found.")).toBeNull();
  });

  it("keeps a slug with no roster row as not found", async () => {
    await renderProfile("/goalkeepers/gk-nobody-on-this-roster");

    expect(await screen.findByText("Goalkeeper not found.")).toBeTruthy();
  });

  it("shows a pending state rather than not found while the roster is in flight", async () => {
    listPlayersMock.mockReturnValue(new Promise(() => {}));

    await renderProfile("/goalkeepers/gk-kwame-asante");

    expect(await screen.findByText("Loading goalkeeper…")).toBeTruthy();
    expect(screen.queryByText("Goalkeeper not found.")).toBeNull();
  });

  it("matches match reports across the two apostrophe spellings", async () => {
    listPlayersMock.mockResolvedValue([APOSTROPHE_PLAYER]);
    listMatchReportsMock.mockResolvedValue({ reports: [CURLY_REPORT] });

    await renderProfile("/goalkeepers/gk-rich-o-donnell");

    expect(await screen.findByRole("heading", { name: "Rich O'Donnell" })).toBeTruthy();
    // The roster spells him with a straight apostrophe and the report with a
    // curly one. Folding only case would drop his whole history here.
    expect(await screen.findByText("Match Reports (1)")).toBeTruthy();
    expect(screen.getAllByText(/Barnsley/).length).toBeGreaterThan(0);
  });

  it("keeps a resolved profile when a later roster refetch fails", async () => {
    // Rows already in cache, but stale, so mounting triggers a refetch — the
    // one Edit Details causes by invalidating ["players"]. That refetch fails.
    listPlayersMock.mockRejectedValue(new Error("roster refetch failed"));

    await renderProfile("/goalkeepers/gk-kwame-asante", (queryClient) => {
      queryClient.setQueryData(["players", "roster"], [LIVE_ONLY_PLAYER], { updatedAt: 0 });
    });

    expect(await screen.findByRole("heading", { name: "Kwame Asante" })).toBeTruthy();
    await waitFor(() => expect(listPlayersMock).toHaveBeenCalled());
    expect(screen.queryByText(/The roster could not be loaded/)).toBeNull();
    expect(screen.queryByText("Goalkeeper not found.")).toBeNull();
  });

  it("reports an unreachable roster as a failure rather than not found", async () => {
    listPlayersMock.mockRejectedValue(new Error("roster unreachable"));

    await renderProfile("/goalkeepers/gk-kwame-asante");

    await waitFor(() => {
      expect(screen.getByText(/The roster could not be loaded/)).toBeTruthy();
    });
    expect(screen.queryByText("Goalkeeper not found.")).toBeNull();
  });
});
