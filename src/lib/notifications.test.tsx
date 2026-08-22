// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ canViewAlerts: false }));

vi.mock("./auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    can: (permission: string) => permission === "alerts.view" && authState.canViewAlerts,
  }),
}));

vi.mock("./mock-data", () => ({
  goalkeepers: [],
  dutyStatusForGk: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

import { NotificationsProvider, useNotifications } from "./notifications";

const storedNotification = {
  id: "duty-1",
  gkId: "gk-1",
  gkName: "Goalkeeper One",
  from: "up_to_date",
  to: "overdue",
  date: "2026-08-22T09:00:00.000Z",
  read: false,
};

function NotificationState() {
  const { items, unread } = useNotifications();
  return <div>{`${items.length} items · ${unread} unread`}</div>;
}

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("rpm.notifications.v1", JSON.stringify([storedNotification]));
  authState.canViewAlerts = false;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("NotificationsProvider alert access", () => {
  it("does not expose stored duty alerts to non-Super-Admin roles", () => {
    render(
      <NotificationsProvider>
        <NotificationState />
      </NotificationsProvider>,
    );

    expect(screen.getByText("0 items · 0 unread")).toBeTruthy();
  });

  it("exposes the duty inbox when the role has System Alerts access", () => {
    authState.canViewAlerts = true;

    render(
      <NotificationsProvider>
        <NotificationState />
      </NotificationsProvider>,
    );

    expect(screen.getByText("1 items · 1 unread")).toBeTruthy();
  });
});
