// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "./app-shell";

const authState = vi.hoisted(() => ({ role: "mentor" as Role }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

// The real permission matrix, so each case sees exactly what that role sees.
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({
      user: {
        id: "app-shell-test-user",
        name: "Test User",
        email: "test@example.com",
        role: authState.role,
        actualRole: authState.role,
        initials: "TU",
        title: "Test",
      },
      loading: false,
      passwordRecoveryPending: false,
      can: (permission: Parameters<typeof actual.roleHasPermission>[1]) =>
        actual.roleHasPermission(authState.role, permission),
      signOut: vi.fn(),
      setViewAsRole: vi.fn(),
    }),
  };
});

vi.mock("@/lib/notifications", () => ({
  useNotifications: () => ({
    items: [],
    unread: 0,
    markAllRead: vi.fn(),
    clearAll: vi.fn(),
    markRead: vi.fn(),
    resolve: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return { ...actual, useServerFn: () => vi.fn().mockResolvedValue([]) };
});

vi.mock("@/components/workflows", () => ({
  WorkflowDialog: ({ kind }: { kind: string | null }) =>
    kind ? <div role="dialog" aria-label={`workflow ${kind}`} /> : null,
}));
vi.mock("@/components/offline-banner", () => ({ OfflineBanner: () => null }));
vi.mock("@/components/sync-manager", () => ({ SyncManager: () => null }));
vi.mock("@/components/install-prompt", () => ({ InstallPrompt: () => null }));

const PATHS = ["/", "/goalkeepers", "/system/users", "/system/data-quality", "/settings"];

async function renderShell(role: Role, initialPath = "/") {
  authState.role = role;
  const rootRoute = createRootRoute({ component: AppShell });
  const children = PATHS.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <p>{path} page</p> }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(children),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Open menu" }));
  const menu = await screen.findByRole("dialog", { name: "Test User" });
  return { menu, router };
}

const SYSTEM_ITEMS = [
  "Manage Users",
  "Permission Check",
  "Integrations",
  "Data Quality",
  "Sync Verification",
];

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matches: false,
      media: "",
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("menu: More group", () => {
  it.each<Role>(["mentor", "mentor_manager", "admin"])(
    "has no More group for %s, who cannot use the system tools",
    async (role) => {
      const { menu } = await renderShell(role);

      expect(within(menu).queryByRole("button", { name: "More" })).toBeNull();
      for (const label of SYSTEM_ITEMS) expect(within(menu).queryByText(label)).toBeNull();
    },
  );

  it("keeps the system tools in a closed More group for super admins", async () => {
    const { menu } = await renderShell("super_admin");

    const more = within(menu).getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    for (const label of SYSTEM_ITEMS) expect(within(menu).queryByText(label)).toBeNull();

    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const group = menu.querySelector("#menu-more") as HTMLElement;
    expect(
      within(group)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(SYSTEM_ITEMS);
    expect(within(group).getByRole("link", { name: "Manage Users" }).getAttribute("href")).toBe(
      "/system/users",
    );
  });

  it("opens More on its own when the current page is a system tool", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const { menu } = await renderShell("super_admin", "/system/data-quality");
    // The current page is brought into view even when the list is long.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.contexts[0]).toBe(
      within(menu).getByRole("link", { name: "Data Quality" }),
    );

    const more = within(menu).getByRole("button", { name: "More" });
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(
      within(menu).getByRole("link", { name: "Data Quality" }).getAttribute("aria-current"),
    ).toBe("page");

    // Still closable by hand on a system page.
    fireEvent.click(more);
    expect(within(menu).queryByRole("link", { name: "Data Quality" })).toBeNull();
  });

  it("keeps the main items in the order a mentor works in", async () => {
    const { menu } = await renderShell("super_admin");
    const nav = within(menu).getByRole("navigation", { name: "Main" });

    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Dashboard",
      "Bulletin Board",
      "Goalkeepers",
      "Match Reports",
      "Interactions",
      "Follow-ups",
      "Calendar",
      "Media Library",
      "Match Clips",
      "Team Members",
      "Audit Log",
      "Notification Centre",
      "Executive",
    ]);
  });

  it("traps Tab inside the menu", async () => {
    const { menu } = await renderShell("super_admin");
    const close = within(menu).getByRole("button", { name: "Close menu" });
    const focusable = menu.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    const last = focusable[focusable.length - 1];

    act(() => last.focus());
    fireEvent.keyDown(menu, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    act(() => close.focus());
    fireEvent.keyDown(menu, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe("menu: footer", () => {
  it.each<Role>(["mentor", "mentor_manager", "admin", "super_admin"])(
    "shows only Account, Settings, Help and Sign out to %s",
    async (role) => {
      const { menu } = await renderShell(role);
      const nav = within(menu).getByRole("navigation", { name: "Main" });
      const footer = nav.nextElementSibling as HTMLElement;

      expect(
        Array.from(footer.querySelectorAll("a, button")).map((item) => item.textContent),
      ).toEqual(["Account", "Settings", "Help", "Sign out"]);
      expect(within(footer).getByRole("link", { name: "Account" }).getAttribute("href")).toBe(
        "/account",
      );
      expect(within(footer).getByRole("link", { name: "Settings" }).getAttribute("href")).toBe(
        "/settings",
      );
      // Moved out of the menu: Add Goalkeeper is on /goalkeepers, appearance
      // is on /settings, and Help & Messages is inside Help.
      for (const gone of [
        "Add Goalkeeper",
        "Help & updates",
        "Help & Messages",
        "Light appearance",
        "Dark appearance",
      ]) {
        expect(within(menu).queryByText(gone)).toBeNull();
      }
    },
  );

  it("opens Help & updates from Help, which leads on to your messages", async () => {
    const { menu } = await renderShell("mentor");

    fireEvent.click(within(menu).getByRole("button", { name: "Help" }));

    const help = await screen.findByRole("dialog", { name: "Help & updates" });
    expect(screen.queryByRole("dialog", { name: "Test User" })).toBeNull();
    expect(within(help).getByRole("button", { name: "Open your messages" })).toBeTruthy();
  });
});
