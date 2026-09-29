// @vitest-environment jsdom

/**
 * The dossier as a mentor meets it: a link on James Beadle's profile, a page
 * that renders the document, and an Export PDF button that produces a file.
 *
 * The harness mirrors `goalkeeper-profile-page.test.tsx` — same root stub, same
 * server-function dispatch — because both pages resolve the goalkeeper from the
 * same roster query, and the dossier must agree with the profile it was opened
 * from.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PILLAR_IDS, type MatchReportRow, type PillarId } from "@/lib/match-reports/schema";
import { routeTree } from "../routeTree.gen";

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: {
      id: "dossier-test-user",
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
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/lib/pwa/register-sw", () => ({ registerSw: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
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

const { exportPdfMock, listMatchReportsMock, listPlayersMock, LOAN_PLAYER } = vi.hoisted(() => ({
  exportPdfMock: vi.fn(),
  listMatchReportsMock: vi.fn(),
  listPlayersMock: vi.fn(),
  /** James Beadle exactly as `public.players` holds him: on loan, Tier 1. */
  LOAN_PLAYER: {
    id: "00000000-0000-4000-8000-000000000001",
    full_name: "James Beadle",
    current_club: "Birmingham City",
    parent_club: "Brighton & Hove Albion",
    on_loan: true,
    league: "EFL Championship",
    nationality: "England",
    instagram_url: null,
    contract_until: "June 2028",
    tier: "Tier 1",
    is_academy: false,
    is_free_agent: false,
  },
}));

vi.mock("@/lib/players.functions", () => ({ listPlayers: listPlayersMock }));
vi.mock("@/lib/duty-of-care.functions", () => ({
  getPlayerDutyOfCare: vi.fn().mockResolvedValue({ state: "green" }),
  listPlayerDutyOfCare: vi.fn().mockResolvedValue([]),
  resetDutyOfCare: vi.fn(),
}));
vi.mock("@/lib/interactions/use-interactions", () => ({
  useLoggedInteractions: () => ({ data: [] }),
}));

// Rendering a real PDF in jsdom would exercise jsPDF, not this page. The
// export path itself is covered by the model and filename tests.
vi.mock("@/lib/dossier/goalkeeper-dossier-pdf", () => ({
  exportGoalkeeperDossierPdf: exportPdfMock,
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: (fn: unknown) =>
      fn === listPlayersMock
        ? () => listPlayersMock()
        : fn === listMatchReportsMock
          ? () => listMatchReportsMock()
          : vi.fn().mockResolvedValue({ reports: [] }),
  };
});

const BEADLE_REPORT: MatchReportRow = {
  report_id: "mr2_beadle_1",
  legacy_report_id: "mr_beadle_1",
  row_index: 1,
  goalkeeper: "James Beadle",
  coach: "A Coach",
  team: "Birmingham City",
  opponent: "Barnsley",
  competition: "EFL Championship",
  match_date: "2026-09-01",
  scores: Object.fromEntries(PILLAR_IDS.map((id) => [id, 4])) as Record<PillarId, number | null>,
  average: 4,
  comments: "Commanded his box all afternoon.",
};

async function renderRoute(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  Object.defineProperty(window, "print", { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  listPlayersMock.mockResolvedValue([LOAN_PLAYER]);
  listMatchReportsMock.mockResolvedValue({ reports: [BEADLE_REPORT] });
  exportPdfMock.mockResolvedValue("james-beadle-dossier-2026-09-28.pdf");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Goalkeeper dossier page", () => {
  it("renders James Beadle's dossier as an HTML document", async () => {
    await renderRoute("/goalkeepers/gk-james-beadle/dossier");

    expect(
      await screen.findByRole("article", { name: "Goalkeeper dossier for James Beadle" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "James Beadle" })).toBeTruthy();
    // A document handed to somebody else has to name the parent club; the
    // profile header deliberately does not.
    expect(
      screen.getByText("Birmingham City (on loan from Brighton & Hove Albion) · EFL Championship"),
    ).toBeTruthy();
    expect(await screen.findByText(/Commanded his box all afternoon/)).toBeTruthy();
    expect(screen.getByText("Recent match reports (1 of 1)")).toBeTruthy();
  });

  it("offers print and PDF export, and keeps them off the printed page", async () => {
    await renderRoute("/goalkeepers/gk-james-beadle/dossier");

    const print = await screen.findByRole("button", { name: /Print/i });
    expect(print.closest(".no-print")).toBeTruthy();
    fireEvent.click(print);
    expect(window.print).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Export PDF/i }));
    await waitFor(() => expect(exportPdfMock).toHaveBeenCalledTimes(1));
    expect(exportPdfMock.mock.calls[0][0]).toMatchObject({ name: "James Beadle" });
  });

  it("keeps a slug with no roster row as not found", async () => {
    await renderRoute("/goalkeepers/gk-nobody-on-this-roster/dossier");

    expect(await screen.findByText("Goalkeeper not found.")).toBeTruthy();
  });

  it("shows a pending state rather than not found while the roster is in flight", async () => {
    listPlayersMock.mockReturnValue(new Promise(() => {}));

    await renderRoute("/goalkeepers/gk-james-beadle/dossier");

    expect(await screen.findByText("Loading dossier…")).toBeTruthy();
    expect(screen.queryByText("Goalkeeper not found.")).toBeNull();
  });

  it("links to the dossier from the goalkeeper's profile and exports from there too", async () => {
    await renderRoute("/goalkeepers/gk-james-beadle");

    const link = await screen.findByRole("link", { name: /View dossier/i });
    expect(link.getAttribute("href")).toBe("/goalkeepers/gk-james-beadle/dossier");

    fireEvent.click(screen.getByRole("button", { name: /Export PDF/i }));
    await waitFor(() => expect(exportPdfMock).toHaveBeenCalledTimes(1));
    // Built from what the profile already resolved, so the exported document
    // carries the same single report the page is showing.
    expect(exportPdfMock.mock.calls[0][0]).toMatchObject({
      name: "James Beadle",
      headline: { reportsTotal: 1, averageRatingLabel: "4.0/5" },
    });
  });
});
