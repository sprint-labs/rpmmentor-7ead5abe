// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { routeTree } from "../routeTree.gen";

/**
 * Placement guard for the manager dashboard's operational grid.
 *
 * Every panel on this page renders a ~130px pending / error / empty state
 * against a 380-500px loaded state, so the one thing that must never regress
 * is that cells take their own content height instead of their row's. These
 * cases assert that invariant, and pin each panel's current column span so a
 * change to the layout has to be made on purpose and shows up in the diff.
 */

const authState = vi.hoisted(() => ({ role: "mentor_manager" }));

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  ROLE_LABEL: {
    super_admin: "Super Admin",
    admin: "Admin",
    mentor_manager: "Mentor Manager",
    mentor: "Mentor",
  },
  useAuth: () => ({
    user: {
      id: "dashboard-layout-test-user",
      name: "Test Manager",
      email: "manager@example.com",
      role: authState.role,
      actualRole: authState.role,
      initials: "TM",
      title: "Test",
    },
    loading: false,
    can: () => true,
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

/**
 * Empty-but-valid answers for every read the page makes. Layout is asserted in
 * the empty state on purpose: that is the state where a stretched cell does
 * the most visible damage.
 */
const {
  listMatchReportsMock,
  getOverviewDashboardStatsMock,
  getRosterSnapshotMock,
  listPlayersMock,
  listCalendarEventsMock,
  listPlayerDutyOfCareMock,
  listInteractionsMock,
  getBulletinSummaryMock,
} = vi.hoisted(() => ({
  listMatchReportsMock: vi.fn(),
  getOverviewDashboardStatsMock: vi.fn(),
  getRosterSnapshotMock: vi.fn(),
  listPlayersMock: vi.fn(),
  listCalendarEventsMock: vi.fn(),
  listPlayerDutyOfCareMock: vi.fn(),
  listInteractionsMock: vi.fn(),
  getBulletinSummaryMock: vi.fn(),
}));

vi.mock("@/lib/match-reports/reports.functions", () => ({
  listMatchReports: listMatchReportsMock,
}));
vi.mock("@/lib/overview-dashboard.functions", () => ({
  getOverviewDashboardStats: getOverviewDashboardStatsMock,
}));
vi.mock("@/lib/roster-snapshot.functions", () => ({ getRosterSnapshot: getRosterSnapshotMock }));
vi.mock("@/lib/players.functions", () => ({ listPlayers: listPlayersMock }));
vi.mock("@/lib/calendar.functions", () => ({ listCalendarEvents: listCalendarEventsMock }));
vi.mock("@/lib/duty-of-care.functions", () => ({
  listPlayerDutyOfCare: listPlayerDutyOfCareMock,
}));
vi.mock("@/lib/bulletins.functions", () => ({ getBulletinSummary: getBulletinSummaryMock }));

vi.mock("@/lib/interactions/use-interactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/interactions/use-interactions")>();
  return {
    ...actual,
    useLoggedInteractions: () => ({ data: [], isPending: false, isError: false }),
  };
});

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  const answers = new Map<unknown, unknown>([
    [listMatchReportsMock, { reports: [] }],
    [
      getOverviewDashboardStatsMock,
      {
        totalGoalkeepers: 0,
        interactionsInPeriod: 0,
        activeMentors: 0,
        matchReportsInPeriod: 0,
        lastSyncedAt: null,
      },
    ],
    [getRosterSnapshotMock, { tiers: [], statuses: [], unassigned: 0, total: 0 }],
    [listPlayersMock, []],
    [listCalendarEventsMock, []],
    [listPlayerDutyOfCareMock, []],
    [listInteractionsMock, []],
    [
      getBulletinSummaryMock,
      {
        boards: [],
        attention: { overdue: 0, dueSoon: 0, unassigned: 0 },
        asOfDate: "2026-09-20",
        dueSoonThrough: "2026-09-27",
        canManage: false,
      },
    ],
  ]);

  return {
    ...actual,
    useServerFn: (fn: unknown) => vi.fn().mockResolvedValue(answers.get(fn) ?? []),
  };
});

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
});

afterEach(() => {
  cleanup();
});

async function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/"] }),
    routeTree,
  });

  await router.load();
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { level: 2, name: "Duty of Care" });

  return rendered;
}

/** The element that actually carries a panel's placement in the grid. */
function cellFor(name: string): HTMLElement {
  const heading = screen.getByRole("heading", { level: 2, name });
  const cell = heading.closest("[class*='col-span-12']");
  if (!(cell instanceof HTMLElement)) {
    throw new Error(`No placement ancestor found for the "${name}" panel`);
  }
  return cell;
}

/** Every panel of the operational grid, by the accessible name of its heading. */
const PANELS = [
  "Duty of Care",
  "Recent Activity",
  "Calendar",
  "Upcoming Fixtures",
  "Tiers & Tags Distribution",
];

describe("dashboard operational grid", () => {
  it("gives every panel its own content height rather than its row's", async () => {
    await renderDashboard();

    for (const name of PANELS) {
      const cell = cellFor(name);
      // Without self-start a grid item stretches to its row, turning each
      // empty state into a void the height of its tallest neighbour.
      expect(cell.className).toContain("self-start");
      // Height is never declared: no row-span, no fixed height, no scroll.
      expect(cell.className).not.toMatch(/(^|\s)(lg:)?row-span-/);
      expect(cell.className).not.toMatch(/(^|\s)(h-\[|min-h-\[|max-h-\[|overflow-y-)/);
    }
  });

  it("stacks every panel full width before the lg breakpoint", async () => {
    await renderDashboard();

    for (const name of PANELS) {
      expect(cellFor(name).className).toContain("col-span-12");
    }
  });

  it("places each panel at the width its content asks for", async () => {
    await renderDashboard();

    // Short-row lists: a bar, a label and a count.
    expect(cellFor("Duty of Care").className).toContain("lg:col-span-4");
    expect(cellFor("Tiers & Tags Distribution").className).toContain("lg:col-span-4");

    // One-sentence rows; a wide measure makes them harder to scan, not easier.
    expect(cellFor("Recent Activity").className).toContain("lg:col-span-4");

    // The calendar and the fixtures that fall in it currently share one cell.
    expect(cellFor("Calendar").className).toContain("lg:col-span-8");
    expect(cellFor("Upcoming Fixtures")).toBe(cellFor("Calendar"));
  });

  it("places Recent Activity from one cell, so it cannot resize when it errors", async () => {
    await renderDashboard();

    // The live panel and the ErrorBoundary fallback used to carry the span
    // string separately, so changing one silently resized the other. The
    // placement now sits on the cell that wraps the boundary itself.
    const cell = cellFor("Recent Activity");
    expect(cell.querySelectorAll("[class*='col-span-']")).toHaveLength(0);
  });
});
