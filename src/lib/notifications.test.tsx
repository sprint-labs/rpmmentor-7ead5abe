// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

const authState = vi.hoisted(() => ({ canViewAlerts: false }));

vi.mock("./auth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    can: (permission: string) => permission === "alerts.view" && authState.canViewAlerts,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

/**
 * The provider reads the live roster and `public.player_duty_of_care`, so both
 * server functions are stubbed and `useServerFn` dispatches on which one it was
 * handed. Every goalkeeper below exists only in these rows — none is in the
 * `goalkeepers` seed array — which is the point: the previous implementation
 * walked that array and could not see them at all.
 */
const { listPlayerDutyOfCareMock, listPlayersMock, liveRows } = vi.hoisted(() => ({
  listPlayerDutyOfCareMock: vi.fn(),
  listPlayersMock: vi.fn(),
  liveRows: {
    players: [] as { full_name: string }[],
    duty: [] as unknown[],
  },
}));

vi.mock("./players.functions", () => ({ listPlayers: listPlayersMock }));
vi.mock("./duty-of-care.functions", () => ({
  listPlayerDutyOfCare: listPlayerDutyOfCareMock,
}));

vi.mock("@tanstack/react-start", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-start")>();
  return {
    ...actual,
    useServerFn: (fn: unknown) =>
      fn === listPlayersMock
        ? vi.fn().mockResolvedValue(liveRows.players)
        : vi.fn().mockResolvedValue(liveRows.duty),
  };
});

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

/** A duty-of-care view row; only the two fields the index reads are meaningful. */
function dutyRow(full_name: string, state: string) {
  return {
    player_id: "00000000-0000-4000-8000-000000000001",
    full_name,
    tier: "Tier 1",
    state,
    rag_status: null,
    status_label: null,
    last_interaction_at: null,
    next_due_at: null,
    days_until_due: null,
    season_count: null,
    period_target: null,
    checkpoints_due: null,
    is_off_season: null,
  };
}

function renderProvider() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsProvider>
        <NotificationState />
      </NotificationsProvider>
    </QueryClientProvider>,
  );
}

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
  window.localStorage.setItem("rpm.notifications.v2", JSON.stringify([storedNotification]));
  authState.canViewAlerts = false;
  liveRows.players = [];
  liveRows.duty = [];
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("NotificationsProvider alert access", () => {
  it("does not expose stored duty alerts to non-Super-Admin roles", () => {
    renderProvider();

    expect(screen.getByText("0 items · 0 unread")).toBeTruthy();
  });

  it("exposes the duty inbox when the role has System Alerts access", () => {
    authState.canViewAlerts = true;

    renderProvider();

    expect(screen.getByText("1 items · 1 unread")).toBeTruthy();
  });
});

describe("resolving a duty notification", () => {
  it("removes every copy of that goalkeeper's current level and records it", () => {
    authState.canViewAlerts = true;
    window.localStorage.setItem(
      "rpm.notifications.v2",
      JSON.stringify([
        storedNotification,
        { ...storedNotification, id: "duty-2", date: "2026-08-23T09:00:00.000Z" },
        { ...storedNotification, id: "duty-3", to: "due_soon" },
      ]),
    );

    renderProvider();

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

/**
 * The inbox used to walk the frozen `goalkeepers` seed array and recompute each
 * level from the empty `interactions` seed. These cases pin the two things that
 * fixed: the roster is `public.players`, and the level is whatever
 * `public.player_duty_of_care` says it is.
 */
describe("duty alerts from the live roster and the duty-of-care view", () => {
  beforeEach(() => {
    authState.canViewAlerts = true;
    window.localStorage.removeItem("rpm.notifications.v2");
  });

  it("announces a goalkeeper who exists only in the live database", async () => {
    // Not in the seed roster, so the previous implementation never saw them.
    liveRows.players = [{ full_name: "Ada Newsigning" }];
    liveRows.duty = [dutyRow("Ada Newsigning", "red")];
    window.localStorage.setItem(
      "rpm.duty.snapshot.v2",
      JSON.stringify({ "gk-ada-newsigning": "due_soon" }),
    );

    renderProvider();

    await waitFor(() => expect(screen.getByText("1 items · 1 unread")).toBeTruthy());
    // The id is the legacy profile slug, which is what the header bell and the
    // alerts page pass to `/goalkeepers/$gkId`.
    expect(
      JSON.parse(window.localStorage.getItem("rpm.notifications.v2") ?? "[]")[0],
    ).toMatchObject({
      gkId: "gk-ada-newsigning",
      gkName: "Ada Newsigning",
      from: "due_soon",
      to: "overdue",
    });
  });

  it("takes the level from the view rather than recomputing it from interactions", async () => {
    // `interactions` is empty, so the old client-side recomputation called every
    // goalkeeper "not enough data" and would have announced a move here. The
    // view says this one is complete, so there is nothing to announce.
    liveRows.players = [{ full_name: "James Beadle" }];
    liveRows.duty = [dutyRow("James Beadle", "complete")];
    window.localStorage.setItem(
      "rpm.duty.snapshot.v2",
      JSON.stringify({ "gk-james-beadle": "up_to_date" }),
    );

    renderProvider();

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("rpm.duty.snapshot.v2") ?? "{}")).toEqual({
        "gk-james-beadle": "up_to_date",
      }),
    );
    expect(screen.getByText("0 items · 0 unread")).toBeTruthy();
  });

  it("does not fire a burst for goalkeepers the snapshot has never seen", async () => {
    // The key space is unchanged, so an existing snapshot still matches. A
    // goalkeeper new to it is recorded silently and announced on their next move.
    liveRows.players = [{ full_name: "Ada Newsigning" }, { full_name: "Bo Latejoiner" }];
    liveRows.duty = [dutyRow("Ada Newsigning", "red"), dutyRow("Bo Latejoiner", "red")];
    window.localStorage.setItem(
      "rpm.duty.snapshot.v2",
      JSON.stringify({ "gk-ada-newsigning": "overdue" }),
    );

    renderProvider();

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("rpm.duty.snapshot.v2") ?? "{}")).toEqual({
        "gk-ada-newsigning": "overdue",
        "gk-bo-latejoiner": "overdue",
      }),
    );
    expect(screen.getByText("0 items · 0 unread")).toBeTruthy();
  });

  it("seeds the starting inbox from the live levels when there is no snapshot", async () => {
    liveRows.players = [{ full_name: "Ada Newsigning" }, { full_name: "Bo Latejoiner" }];
    liveRows.duty = [dutyRow("Ada Newsigning", "red"), dutyRow("Bo Latejoiner", "complete")];

    renderProvider();

    // Only the goalkeeper who needs attention, and no toast for a seeded item.
    await waitFor(() => expect(screen.getByText("1 items · 1 unread")).toBeTruthy());
    expect(screen.getByText("resolve seed-gk-ada-newsigning")).toBeTruthy();
  });

  it("writes no snapshot until both live reads have answered", () => {
    // A pending read is not "everyone is at not enough data"; snapshotting that
    // difference would invent a change for the whole roster.
    liveRows.players = [{ full_name: "Ada Newsigning" }];
    liveRows.duty = [dutyRow("Ada Newsigning", "red")];
    window.localStorage.setItem(
      "rpm.duty.snapshot.v2",
      JSON.stringify({ "gk-ada-newsigning": "due_soon" }),
    );

    renderProvider();

    expect(JSON.parse(window.localStorage.getItem("rpm.duty.snapshot.v2") ?? "{}")).toEqual({
      "gk-ada-newsigning": "due_soon",
    });
  });
});

/**
 * The v1 key space held what the previous implementation computed from the empty
 * `interactions` seed: exactly two values across the whole roster, 100
 * `not_enough_data` and 14 `not_required`. Reading it as a record of anyone's
 * previous duty level announces a change for every goalkeeper the live view
 * disagrees with — up to a hundred alerts and a hundred toasts on one load.
 */
describe("the v1 key space is not read as a previous level", () => {
  beforeEach(() => {
    authState.canViewAlerts = true;
    window.localStorage.clear();
  });

  it("announces nothing when only the stale v1 snapshot exists", async () => {
    // What every current browser holds: the live view contradicts all of it.
    window.localStorage.setItem(
      "rpm.duty.snapshot.v1",
      JSON.stringify({
        "gk-ada-newsigning": "not_enough_data",
        "gk-bo-latejoiner": "not_enough_data",
        "gk-fourth-tier": "not_required",
      }),
    );
    liveRows.players = [
      { full_name: "Ada Newsigning" },
      { full_name: "Bo Latejoiner" },
      { full_name: "Fourth Tier" },
    ];
    liveRows.duty = [
      dutyRow("Ada Newsigning", "red"),
      dutyRow("Bo Latejoiner", "amber"),
      dutyRow("Fourth Tier", "green"),
    ];

    renderProvider();

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("rpm.duty.snapshot.v2") ?? "{}")).toEqual({
        "gk-ada-newsigning": "overdue",
        "gk-bo-latejoiner": "due_soon",
        "gk-fourth-tier": "up_to_date",
      }),
    );

    // Two goalkeepers need attention, so the silent seed path states them. What
    // must not happen is a transition alert, and no toast may fire.
    const stored = JSON.parse(window.localStorage.getItem("rpm.notifications.v2") ?? "[]");
    expect(stored.map((n: { id: string }) => n.id).sort()).toEqual([
      "seed-gk-ada-newsigning",
      "seed-gk-bo-latejoiner",
    ]);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    // The stale key is left alone so a rollback still finds its own state.
    expect(window.localStorage.getItem("rpm.duty.snapshot.v1")).toBeTruthy();
  });

  it("announces nothing when a stale v1 inbox exists alongside the v1 snapshot", async () => {
    // With items already stored the seed path is skipped, so this asserts the
    // other branch: no fresh transition is derived from v1 either.
    window.localStorage.setItem(
      "rpm.duty.snapshot.v1",
      JSON.stringify({ "gk-ada-newsigning": "not_enough_data" }),
    );
    window.localStorage.setItem("rpm.notifications.v1", JSON.stringify([storedNotification]));
    liveRows.players = [{ full_name: "Ada Newsigning" }];
    liveRows.duty = [dutyRow("Ada Newsigning", "red")];

    renderProvider();

    await waitFor(() =>
      expect(JSON.parse(window.localStorage.getItem("rpm.duty.snapshot.v2") ?? "{}")).toEqual({
        "gk-ada-newsigning": "overdue",
      }),
    );
    expect(toast.error).not.toHaveBeenCalled();
    // The v1 inbox is not carried forward; the v2 inbox states the live condition.
    expect(
      JSON.parse(window.localStorage.getItem("rpm.notifications.v2") ?? "[]").map(
        (n: { id: string }) => n.id,
      ),
    ).toEqual(["seed-gk-ada-newsigning"]);
  });
});
