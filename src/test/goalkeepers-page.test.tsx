// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { DUTY_LABELS } from "@/lib/mock-data";
import { routeTree } from "../routeTree.gen";

const authState = vi.hoisted(() => ({ role: "mentor" }));

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: {
      id: "goalkeepers-test-user",
      name: "Test User",
      email: "test@example.com",
      role: authState.role,
      actualRole: authState.role,
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

vi.mock("@/components/app-shell", () => ({
  AppShell: () => <Outlet />,
}));

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

vi.mock("@/lib/match-reports/reports.functions", () => ({ listMatchReports: vi.fn() }));

const { listPlayerDutyOfCareMock, listPlayersMock, DUTY_ROWS, PLAYER_ROWS } = vi.hoisted(() => ({
  listPlayerDutyOfCareMock: vi.fn(),
  listPlayersMock: vi.fn(),
  // The roster is a database read now, so these cases need rows to render.
  // A handful is enough: they are about layout, search and the filter chips.
  PLAYER_ROWS: [
    {
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
    {
      id: "00000000-0000-4000-8000-000000000002",
      full_name: "Max Crocombe",
      current_club: "Millwall",
      parent_club: null,
      on_loan: false,
      league: "EFL Championship",
      nationality: "New Zealand",
      instagram_url: null,
      contract_until: "June 2027",
      tier: "Tier 1",
      is_academy: false,
      is_free_agent: false,
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      full_name: "Toby Bell",
      current_club: "Chelsea",
      parent_club: "Chelsea",
      on_loan: false,
      league: "Premier League",
      nationality: "England",
      instagram_url: null,
      contract_until: "June 2027",
      // Tiered AND Academy: the pairing the old single column could not hold.
      tier: "Tier 1",
      is_academy: true,
      is_free_agent: false,
    },
  ],
  // Empty on purpose: these cases are about the page's layout and filters, and
  // an empty view keeps every duty label confined to the filter chips, which is
  // exactly what the first case asserts. The mapping itself is covered by
  // src/lib/duty-of-care-roster.test.ts.
  DUTY_ROWS: [] as unknown[],
}));
vi.mock("@/lib/duty-of-care.functions", () => ({
  listPlayerDutyOfCare: listPlayerDutyOfCareMock,
}));
vi.mock("@/lib/players.functions", () => ({ listPlayers: listPlayersMock }));

// The page calls more than one server function and they answer with different
// shapes, so the stub dispatches on which one it was handed rather than giving
// everything the match-reports envelope.
vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: (fn: unknown) =>
      fn === listPlayerDutyOfCareMock
        ? vi.fn().mockResolvedValue(DUTY_ROWS)
        : fn === listPlayersMock
          ? // The roster deliberately lands AFTER duty of care, which is the
            // order production sees. Anything derived from the roster has to
            // recompute on its arrival; resolving both together would let a
            // memo with a missing roster dependency pass by luck.
            vi.fn().mockImplementation(
              () =>
                new Promise((resolve) => {
                  setTimeout(() => resolve(PLAYER_ROWS), 20);
                }),
            )
          : vi.fn().mockResolvedValue({ reports: [] }),
  };
});

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width, writable: true });
  window.dispatchEvent(new Event("resize"));
}

async function renderGoalkeepers(initialEntry = "/goalkeepers", role = "mentor") {
  authState.role = role;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree,
  });

  await router.load();
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Goalkeepers" });

  return { ...rendered, router };
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
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: MouseEvent,
  });
});

beforeEach(() => {
  setViewport(390);
});

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
  document.documentElement.removeAttribute("style");
  vi.clearAllMocks();
});

describe("Goalkeepers page", () => {
  it.each(["mentor", "admin", "super_admin"])(
    "does not render the four summary cards for %s users",
    async (role) => {
      await renderGoalkeepers("/goalkeepers", role);

      expect(screen.queryByText("Total Under Care")).toBeNull();
      for (const label of [DUTY_LABELS.up_to_date, DUTY_LABELS.due_soon, DUTY_LABELS.overdue]) {
        expect(screen.getAllByText(label).every((element) => element.closest("button"))).toBe(true);
      }
      expect(screen.getAllByText(/results$/).length).toBeGreaterThan(0);
    },
    60_000,
  );

  it("counts the duty chips over the roster once it has loaded", async () => {
    // The roster used to be a module constant, so the memo that counts these
    // chips was written without it in its dependency list. When the roster
    // became a database read that starts empty, every chip rendered 0 beside a
    // full list of results — a number the page contradicted on the same screen.
    //
    // This asserts the behaviour, not the cause: `useMemo` is a performance
    // hint that React may recompute anyway, so no component test can force the
    // stale-cache condition reliably. The dependency array is what makes it
    // correct; this is here to catch a chip that stops counting the roster for
    // any reason.
    await renderGoalkeepers();

    await waitFor(() => {
      expect(screen.getAllByText("3 results").length).toBeGreaterThan(0);
    });

    // The chip reads as its label followed by its count, e.g. "All3".
    const chipTexts = screen
      .getAllByRole("button")
      .map((button) => button.textContent ?? "")
      .filter((text) => /^All\s*\d+$/.test(text));

    expect(chipTexts.length).toBeGreaterThan(0);
    for (const text of chipTexts) {
      expect(text).toBe(`All${PLAYER_ROWS.length}`);
    }
  });

  it("fills the advanced filter dropdowns from the loaded roster", async () => {
    // Same class of bug: these options were derived once, from an empty roster.
    await renderGoalkeepers();

    await waitFor(() => {
      expect(screen.getAllByText("3 results").length).toBeGreaterThan(0);
    });

    // Every league the fixture rows carry should be offerable as an option.
    const leagues = new Set(PLAYER_ROWS.map((row) => row.league));
    for (const league of leagues) {
      expect(screen.getAllByText(league).length).toBeGreaterThan(0);
    }
  });

  it("keeps search visible and updates the URL-backed result query", async () => {
    const { router } = await renderGoalkeepers();
    const search = screen.getByRole("textbox", { name: "Search goalkeepers" });

    fireEvent.change(search, { target: { value: "beadle" } });

    await waitFor(() => {
      expect(router.state.location.search.q).toBe("beadle");
    });
    expect(screen.getAllByText("1 results").length).toBeGreaterThan(0);
  });

  it("opens and closes mobile Filters while preserving selected tiers", async () => {
    const { router } = await renderGoalkeepers();
    const filtersTrigger = screen.getByRole("button", { name: "Filters" });

    fireEvent.click(filtersTrigger);
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: "Tier 1" }));

    await waitFor(() => {
      expect(router.state.location.search.tiers).toBe("Tier 1");
    });
    expect(filtersTrigger.getAttribute("aria-label")).toBe("Filters, 1 active");

    fireEvent.click(within(drawer).getByRole("button", { name: "Close filters" }));
    await waitFor(() => {
      expect(filtersTrigger.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(filtersTrigger);
    });

    fireEvent.click(filtersTrigger);
    await waitFor(() => expect(filtersTrigger.getAttribute("aria-expanded")).toBe("true"));
    const reopenedDrawer = screen.getByRole("dialog");
    expect(
      within(reopenedDrawer).getByRole("button", { name: "Tier 1" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps primary filters and advanced filters available in the mobile drawer", async () => {
    const { router } = await renderGoalkeepers();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Primary filters")).toBeTruthy();
    expect(within(drawer).getByText("Duty of care status")).toBeTruthy();

    const advanced = within(drawer).getByRole("button", { name: /Advanced filters/ });
    expect(advanced.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(advanced);
    expect(advanced.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(within(drawer).getByRole("button", { name: "UK Based" }));
    await waitFor(() => expect(router.state.location.search.cat).toBe("UK Based"));
  });

  it.each(["Tier 1", "Tier 2", "Tier 3", "Tier 4"])(
    "allows %s to be selected independently in mobile Filters",
    async (tier) => {
      const { router } = await renderGoalkeepers();

      fireEvent.click(screen.getByRole("button", { name: "Filters" }));
      const drawer = await screen.findByRole("dialog");
      fireEvent.click(within(drawer).getByRole("button", { name: tier }));

      await waitFor(() => expect(router.state.location.search.tiers).toBe(tier));
    },
  );

  it("supports multiple mobile tiers, reports active filters, and clears only filters", async () => {
    const { router } = await renderGoalkeepers("/goalkeepers?q=beadle");
    const filtersTrigger = screen.getByRole("button", { name: "Filters" });

    fireEvent.click(filtersTrigger);
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: "Tier 1" }));

    await waitFor(() => {
      expect(router.state.location.search.tiers).toBe("Tier 1");
    });
    fireEvent.click(within(drawer).getByRole("button", { name: "Tier 2" }));

    await waitFor(() => {
      expect(router.state.location.search.tiers).toBe("Tier 1,Tier 2");
    });
    expect(filtersTrigger.getAttribute("aria-label")).toBe("Filters, 2 active");

    fireEvent.click(within(drawer).getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(router.state.location.search.tiers).toBe("");
      expect(router.state.location.search.q).toBe("beadle");
    });
  });

  it("canonicalises a legacy grouped tier URL on mobile without hiding the active choice", async () => {
    const { router } = await renderGoalkeepers("/goalkeepers?cat=Tier%201-2");

    await waitFor(() => {
      expect(router.state.location.search.cat).toBe("All");
      expect(router.state.location.search.tiers).toBe("Tier 1,Tier 2");
    });

    const filtersTrigger = screen.getByRole("button", { name: "Filters, 2 active" });
    fireEvent.click(filtersTrigger);
    const drawer = await screen.findByRole("dialog");
    expect(
      within(drawer).getByRole("button", { name: "Tier 1" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(drawer).getByRole("button", { name: "Tier 2" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("makes a conflicting legacy grouped tier URL visible and removable on mobile", async () => {
    const { router } = await renderGoalkeepers("/goalkeepers?cat=Tier%201-2&tiers=Tier%203");

    fireEvent.click(screen.getByRole("button", { name: "Filters, 2 active" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Legacy tier filter")).toBeTruthy();
    expect(within(drawer).getByText(/incompatible individual tier selection/)).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("button", { name: "Remove grouped tier filter" }));
    await waitFor(() => {
      expect(router.state.location.search.cat).toBe("All");
      expect(router.state.location.search.tiers).toBe("Tier 3");
    });
  });

  it("keeps legacy grouped tier URLs available to the unchanged desktop controls", async () => {
    setViewport(1280);
    const { router } = await renderGoalkeepers("/goalkeepers?cat=Tier%201-2");

    const groupedTier = screen.getByRole("button", { name: "Tier 1-2" });
    expect(groupedTier.getAttribute("aria-pressed")).toBe("true");
    expect(router.state.location.search.cat).toBe("Tier 1-2");
    expect(router.state.location.search.tiers).toBe("");
  });

  it("exposes selected state and remains usable in desktop filters", async () => {
    setViewport(1024);
    const { router } = await renderGoalkeepers();
    const ukBased = screen.getByRole("button", { name: "UK Based" });

    expect(ukBased.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(ukBased);
    await waitFor(() => expect(router.state.location.search.cat).toBe("UK Based"));
    expect(ukBased.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps search, sort selection, and filters usable together", async () => {
    const { router } = await renderGoalkeepers();

    fireEvent.change(screen.getByRole("textbox", { name: "Search goalkeepers" }), {
      target: { value: "beadle" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("button", { name: "UK Based" }));
    fireEvent.click(within(drawer).getByRole("button", { name: "Apply filters" }));

    const sort = screen.getByLabelText("Sort by") as HTMLSelectElement;
    fireEvent.change(sort, { target: { value: "goalkeeper" } });
    await waitFor(() => {
      expect(router.state.location.search.q).toBe("beadle");
      expect(router.state.location.search.cat).toBe("UK Based");
    });
    expect(sort.value).toBe("goalkeeper");
  });
});
