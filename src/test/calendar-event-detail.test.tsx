// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { routeTree } from "../routeTree.gen";

/**
 * Clicking an entry on the calendar opens what it holds, for everyone.
 *
 * Owner request: a manager clicking an event was dropped straight into the
 * edit form. Reading an event now comes first, and Edit is one click further
 * for those allowed to make the change.
 */

const authState = vi.hoisted(() => ({ canManage: true }));

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
      id: "calendar-test-user",
      name: "Test User",
      email: "user@example.com",
      role: authState.canManage ? "mentor_manager" : "mentor",
      actualRole: authState.canManage ? "mentor_manager" : "mentor",
      initials: "TU",
      title: "Test",
    },
    loading: false,
    can: (permission: string) => permission !== "calendar.manage" || authState.canManage,
    signIn: vi.fn(),
    signOut: vi.fn(),
    setViewAsRole: vi.fn(),
  }),
}));

vi.mock("@/routes/__root", async () => {
  const React = await import("react");
  const { Outlet, createRootRouteWithContext } = await import("@tanstack/react-router");
  return {
    Route: createRootRouteWithContext()({ component: () => React.createElement(Outlet) }),
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
vi.mock("@/components/workflows", () => ({ WorkflowDialog: () => null }));
vi.mock("@/components/calendar/fixture-import-dialog", () => ({
  FixtureImportDialog: () => null,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const EVENT = vi.hoisted(() => ({
  id: "event-1",
  title: "Coffee with Sam",
  event_type: "Coffee Catch-up",
  event_date: "2026-10-15",
  start_time: "10:30:00",
  end_time: null,
  location: "Training ground",
  notes: "Talk through the loan move.",
  participation_status: "unconfirmed",
  player_id: null,
  goalkeeper_name: "Sam Keeper",
  assigned_mentor_id: null,
  assigned_mentor_name: "Mentor One",
  status: "scheduled",
  cancellation_reason: "",
  follow_up_waived_at: null,
  follow_up_waiver_reason: "",
  created_by: "someone",
  created_by_name: "Someone",
}));

const { listCalendarEventsMock, listEventFollowUpsMock } = vi.hoisted(() => ({
  listCalendarEventsMock: vi.fn(),
  listEventFollowUpsMock: vi.fn(),
}));

vi.mock("@/lib/calendar.functions", () => ({
  listCalendarEvents: listCalendarEventsMock,
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  updateMatchParticipation: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  listAssignableMentors: vi.fn(),
  CALENDAR_EVENT_TYPES: ["Match", "Training Ground Visit", "Coffee Catch-up"],
}));
vi.mock("@/lib/events/follow-up.functions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/events/follow-up.functions")>()),
  listEventFollowUps: listEventFollowUpsMock,
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  const answers = new Map<unknown, unknown>([
    [listCalendarEventsMock, [EVENT]],
    [listEventFollowUpsMock, { rows: [] }],
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

async function renderCalendar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: ["/calendar?month=2026-10"] }),
    routeTree,
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // The month grid's entry for the event, which is what the owner clicked.
  return screen.findByRole("button", { name: "10:30 Coffee with Sam" }, { timeout: 5000 });
}

describe("calendar event click", () => {
  it("opens the details for a manager, with Edit one click further", async () => {
    authState.canManage = true;
    fireEvent.click(await renderCalendar());

    const dialog = screen.getByRole("dialog", { name: "Coffee with Sam" });
    expect(within(dialog).getByText("Sam Keeper")).toBeTruthy();
    expect(within(dialog).getByText("Talk through the loan move.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Edit event" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /edit event/i }));
    expect(screen.getByRole("heading", { name: "Edit event" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Coffee with Sam" })).toBeNull();
  });

  it("opens the same details without an Edit button for someone who cannot edit", async () => {
    authState.canManage = false;
    fireEvent.click(await renderCalendar());

    const dialog = screen.getByRole("dialog", { name: "Coffee with Sam" });
    expect(within(dialog).getByText("Sam Keeper")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /edit event/i })).toBeNull();
  });
});
