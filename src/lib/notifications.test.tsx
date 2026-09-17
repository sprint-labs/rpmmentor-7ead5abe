// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

import {
  NotificationsProvider,
  isDutyLevelResolved,
  pruneResolvedDutyLevels,
  useNotifications,
} from "./notifications";

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
  const { items, unread, resolve } = useNotifications();
  return (
    <div>
      <div>{`${items.length} items · ${unread} unread`}</div>
      {items.map((item) => (
        <button key={item.id} onClick={() => resolve(item.id)}>
          {`resolve ${item.id}`}
        </button>
      ))}
    </div>
  );
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

describe("resolving a duty notification", () => {
  it("removes every copy of that goalkeeper's current level and records it", () => {
    authState.canViewAlerts = true;
    window.localStorage.setItem(
      "rpm.notifications.v1",
      JSON.stringify([
        storedNotification,
        { ...storedNotification, id: "duty-2", date: "2026-08-23T09:00:00.000Z" },
        { ...storedNotification, id: "duty-3", to: "due_soon" },
      ]),
    );

    render(
      <NotificationsProvider>
        <NotificationState />
      </NotificationsProvider>,
    );

    expect(screen.getByText("3 items · 3 unread")).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByText("resolve duty-1"));
    });

    // The repeat of the same condition goes with it; a different level stays.
    expect(screen.getByText("1 items · 1 unread")).toBeTruthy();
    expect(screen.getByText("resolve duty-3")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem("rpm.duty.resolved.v1") ?? "{}")).toEqual({
      "gk-1": "overdue",
    });
  });
});

describe("resolved duty levels", () => {
  it("suppresses only the level that was acknowledged", () => {
    const resolved = { "gk-1": "overdue" as const };
    expect(isDutyLevelResolved(resolved, "gk-1", "overdue")).toBe(true);
    expect(isDutyLevelResolved(resolved, "gk-1", "due_soon")).toBe(false);
    expect(isDutyLevelResolved(resolved, "gk-2", "overdue")).toBe(false);
  });

  it("forgets an acknowledgement once the goalkeeper's duty status moves", () => {
    const resolved = { "gk-1": "overdue" as const, "gk-2": "due_soon" as const };
    expect(pruneResolvedDutyLevels(resolved, { "gk-1": "overdue", "gk-2": "overdue" })).toEqual({
      "gk-1": "overdue",
    });
  });
});
