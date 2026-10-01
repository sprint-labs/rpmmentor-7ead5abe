// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme";
import { routeTree } from "../routeTree.gen";

vi.mock("@/lib/auth", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: {
      id: "settings-test-user",
      name: "Test User",
      email: "test@example.com",
      role: "mentor",
      actualRole: "mentor",
      initials: "TU",
      title: "Test",
    },
    loading: false,
    can: () => true,
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
    },
  },
}));

async function renderSettings() {
  const router = createRouter({
    context: { queryClient: new QueryClient() },
    history: createMemoryHistory({ initialEntries: ["/settings"] }),
    routeTree,
  });
  await router.load();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  await screen.findByRole("heading", { name: "Settings" });
}

afterEach(() => {
  cleanup();
  document.documentElement.className = "";
  window.localStorage.clear();
});

describe("Settings page", () => {
  it("switches between light and dark appearance and remembers the choice", async () => {
    document.documentElement.classList.add("dark");
    await renderSettings();

    const light = screen.getByRole("radio", { name: /Light/ });
    const dark = screen.getByRole("radio", { name: /Dark/ });
    expect(screen.getByRole("group", { name: "Appearance" })).toBeTruthy();
    expect((dark as HTMLInputElement).checked).toBe(true);

    fireEvent.click(light);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("rpm.theme")).toBe("light");
    expect((light as HTMLInputElement).checked).toBe(true);

    fireEvent.click(dark);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem("rpm.theme")).toBe("dark");
  });
});
