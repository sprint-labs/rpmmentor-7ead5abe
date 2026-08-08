// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaintenanceScreen } from "./maintenance-screen";

afterEach(cleanup);

describe("MaintenanceScreen", () => {
  it("explains the temporary restriction and how to get help", () => {
    render(<MaintenanceScreen onSignOut={() => undefined} />);

    expect(screen.getByRole("heading", { name: "Final updates in progress" })).toBeTruthy();
    expect(screen.getByText(/live again within the next couple of hours/i)).toBeTruthy();
    expect(screen.getByText(/if you have any questions, please contact/i)).toBeTruthy();
    expect(screen.getByText("Luke")).toBeTruthy();
  });

  it("lets the restricted user sign out", () => {
    const onSignOut = vi.fn();
    render(<MaintenanceScreen onSignOut={onSignOut} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it("lets an installed app user check whether access has been restored", () => {
    const onCheckAgain = vi.fn();
    render(<MaintenanceScreen onSignOut={() => undefined} onCheckAgain={onCheckAgain} />);

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));

    expect(onCheckAgain).toHaveBeenCalledOnce();
  });
});
