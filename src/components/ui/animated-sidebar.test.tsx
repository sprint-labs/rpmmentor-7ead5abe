// @vitest-environment jsdom

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { LayoutDashboard, LogOut } from "lucide-react";

import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  useSidebar,
  type SidebarLinkItem,
} from "@/components/ui/animated-sidebar";

afterEach(cleanup);

const LINKS = [
  { label: "Dashboard", href: "/", icon: <LayoutDashboard data-testid="icon-dashboard" /> },
  { label: "Logout", href: "/login", icon: <LogOut data-testid="icon-logout" /> },
] as unknown as SidebarLinkItem[];

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <Sidebar open={open} setOpen={setOpen}>
      <SidebarBody data-testid="sidebar-body">
        {LINKS.map((link) => (
          <SidebarLink key={link.label} link={link} />
        ))}
      </SidebarBody>
    </Sidebar>
  );
}

/** Mounts the sidebar inside a real router, since SidebarLink renders `Link`. */
async function renderSidebar(ui: React.ReactNode) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <>{ui}</>,
  });
  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/login",
    component: () => <>{ui}</>,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  await router.load();
  return render(<RouterProvider router={router as never} />);
}

describe("animated sidebar", () => {
  it("renders every link's label and icon, with hrefs pointing at real routes", async () => {
    await renderSidebar(<Harness />);

    // Desktop rail and mobile overlay both mount, so labels appear twice.
    await waitFor(() => expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Logout").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("icon-dashboard").length).toBeGreaterThan(0);

    const dashboard = screen.getAllByRole("link", { name: /Dashboard/ })[0];
    expect(dashboard.getAttribute("href")).toBe("/");
    expect(dashboard.getAttribute("aria-label")).toBe("Dashboard");
    const logout = screen.getAllByRole("link", { name: /Logout/ })[0];
    expect(logout.getAttribute("href")).toBe("/login");
    expect(logout.getAttribute("aria-label")).toBe("Logout");
  });

  it("expands the desktop rail on hover and collapses it on leave", async () => {
    const { container } = await renderSidebar(<Harness />);

    const rail = container.querySelector<HTMLElement>(".md\\:flex-col");
    expect(rail).not.toBeNull();

    fireEvent.mouseEnter(rail!);
    await waitFor(() => expect(rail!.style.width).toBe("300px"));
    await waitFor(() =>
      expect(
        screen.getAllByRole("link", { name: "Dashboard" })[0].getAttribute("aria-label"),
      ).toBeNull(),
    );

    fireEvent.mouseLeave(rail!);
    await waitFor(() => expect(rail!.style.width).toBe("60px"));
    await waitFor(() =>
      expect(screen.getAllByRole("link", { name: "Dashboard" })[0].getAttribute("aria-label")).toBe(
        "Dashboard",
      ),
    );
  });

  it("opens and closes the mobile overlay from the menu button", async () => {
    await renderSidebar(<Harness />);

    const openButton = screen.getByRole("button", { name: "Open menu" });
    expect(openButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(openButton);
    await waitFor(() => expect(screen.getByRole("button", { name: "Close menu" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Open menu" }).getAttribute("aria-expanded")).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull());
  });

  it("throws when useSidebar is called outside a provider", () => {
    const Orphan = () => {
      useSidebar();
      return null;
    };
    expect(() => render(<Orphan />)).toThrow(/must be used within a SidebarProvider/);
  });
});
