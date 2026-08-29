// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...props
  }: PropsWithChildren<AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { PlatformWorkspaceNavigation } from "./platform-workspace-navigation";

describe("PlatformWorkspaceNavigation", () => {
  it("shows the real workspaces and keeps the Scouting sign-in boundary explicit", () => {
    render(<PlatformWorkspaceNavigation path="/" canViewBulletins onNavigate={() => undefined} />);

    expect(screen.getByText("Mentor")).toBeTruthy();
    expect(screen.getByText("Bulletin")).toBeTruthy();

    const scouting = screen.getByRole("link", { name: /Scouting: Player search/ });
    expect(scouting.getAttribute("href")).toBe("https://gkhq.app/goalkeepers");
    expect(scouting.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("Separate sign-in")).toBeTruthy();
  });

  it("hides Bulletin without permission and closes the drawer after internal navigation", () => {
    const onNavigate = vi.fn();
    render(
      <PlatformWorkspaceNavigation
        path="/goalkeepers"
        canViewBulletins={false}
        onNavigate={onNavigate}
      />,
    );

    expect(screen.queryByText("Bulletin")).toBeNull();
    fireEvent.click(screen.getByText("Mentor"));
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});
