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

async function renderProfile(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree,
  });

  await router.load();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
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

  it("reports an unreachable roster as a failure rather than not found", async () => {
    listPlayersMock.mockRejectedValue(new Error("roster unreachable"));

    await renderProfile("/goalkeepers/gk-kwame-asante");

    await waitFor(() => {
      expect(screen.getByText(/The roster could not be loaded/)).toBeTruthy();
    });
    expect(screen.queryByText("Goalkeeper not found.")).toBeNull();
  });

  it("keeps a cached profile when a later roster refetch fails", async () => {
    const { queryClient } = await renderProfile("/goalkeepers/gk-kwame-asante");

    expect(await screen.findByRole("heading", { name: "Kwame Asante" })).toBeTruthy();

    listPlayersMock.mockRejectedValue(new Error("roster unreachable"));
    await queryClient.refetchQueries({ queryKey: ["players", "roster"] });

    expect(screen.getByRole("heading", { name: "Kwame Asante" })).toBeTruthy();
    expect(screen.queryByText(/The roster could not be loaded/)).toBeNull();
  });

  it("matches match reports when the filed name uses the other apostrophe", async () => {
    listPlayersMock.mockResolvedValue([
      {
        ...LIVE_ONLY_PLAYER,
        id: "00000000-0000-4000-8000-0000000000bb",
        full_name: "Rich O'Donnell",
        current_club: "Cambridge United",
        league: "League Two",
        nationality: "Republic of Ireland",
      },
    ]);
    listMatchReportsMock.mockResolvedValue({
      reports: [
        {
          report_id: "mr2_rich_odonnell",
          legacy_report_id: "mr_rich_odonnell",
          row_index: 2,
          goalkeeper: "Rich O\u2019Donnell",
          coach: "Test Coach",
          team: "Cambridge United",
          opponent: "Derby County",
          competition: "League Two",
          match_date: "2026-01-15",
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
      ],
    });

    await renderProfile("/goalkeepers/gk-rich-o-donnell");

    expect(await screen.findByRole("heading", { name: "Rich O'Donnell" })).toBeTruthy();
    expect(await screen.findByText("Match Reports (1)")).toBeTruthy();
    expect(screen.getByText(/Opponent: Derby County/)).toBeTruthy();
    expect(screen.queryByText("No Match Reports recorded for this goalkeeper yet.")).toBeNull();
  });
});
