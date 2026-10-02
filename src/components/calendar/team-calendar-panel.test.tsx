// @vitest-environment jsdom

import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import {
  TeamCalendarPanel,
  type TeamCalendarPanelEvent,
  type TeamCalendarPanelInteraction,
} from "@/components/calendar/team-calendar-panel";

// The panel only needs Link to render an anchor carrying its target; the
// router itself is not under test here.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search, params, ...rest }: Record<string, unknown>) => {
    const query = search as { month?: string } | undefined;
    const path = Object.entries((params as Record<string, string>) ?? {}).reduce(
      (acc, [key, value]) => acc.replace(`$${key}`, value),
      String(to),
    );
    return (
      <a href={query?.month ? `${path}?month=${query.month}` : path} {...(rest as object)}>
        {children as React.ReactNode}
      </a>
    );
  },
}));

const TODAY = "2026-09-19";

function event(
  id: string,
  date: string,
  overrides: Partial<TeamCalendarPanelEvent> = {},
): TeamCalendarPanelEvent {
  return {
    id,
    event_date: date,
    start_time: null,
    title: `Event ${id}`,
    event_type: "Match",
    goalkeeper_name: null,
    location: null,
    status: "scheduled",
    ...overrides,
  };
}

function logged(id: string, date: string, goalkeeperName = "Logged Keeper") {
  return {
    id,
    occurredAt: date,
    interactionType: "Coffee Catch-up",
    goalkeeperName,
    mentorName: "Mentor One",
  } satisfies TeamCalendarPanelInteraction;
}

function renderPanel(props: Partial<Parameters<typeof TeamCalendarPanel>[0]> = {}) {
  return render(
    <TeamCalendarPanel events={[]} pending={false} error={false} today={TODAY} {...props} />,
  );
}

/** The right-hand list: everything after the "Upcoming" or day heading. */
function list(): HTMLElement {
  const heading = screen.getByRole("heading", { level: 3 });
  return heading.closest("div.min-w-0") as HTMLElement;
}

afterEach(cleanup);

describe("TeamCalendarPanel", () => {
  it("opens on the month containing today and marks today only", () => {
    renderPanel();
    expect(screen.getByText("September 2026")).toBeTruthy();
    const marked = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-current") === "date");
    expect(marked).toHaveLength(1);
    expect(marked[0]?.getAttribute("aria-label")).toBe("2026-09-19 — nothing on (today)");
  });

  it("names what is on a day in its square, cancellations excluded", () => {
    renderPanel({
      events: [
        event("a", "2026-09-21", { start_time: "15:00:00", goalkeeper_name: "Sam Keeper" }),
        event("b", "2026-09-21", { event_type: "Coffee Catch-up", goalkeeper_name: "Alex Gk" }),
        event("c", "2026-09-21", { status: "cancelled", goalkeeper_name: "Gone Gk" }),
      ],
      interactions: [logged("i1", "2026-09-21")],
    });
    expect(
      screen.getByLabelText("2026-09-21 — 1 fixture, 1 interaction booked, 1 interaction logged"),
    ).toBeTruthy();
    const square = screen.getByLabelText(/^2026-09-21/);
    // Two named, the rest counted. The untimed booking sorts before the 15:00 one.
    expect(within(square).getByText("Alex Gk")).toBeTruthy();
    expect(within(square).getByText("15:00 Sam Keeper")).toBeTruthy();
    expect(within(square).getByText("+1 more")).toBeTruthy();
    expect(within(square).queryByText(/Gone Gk/)).toBeNull();
  });

  it("lists what is coming up from today, in order, and says when it is capped", () => {
    const events = [
      event("past", "2026-09-18", { title: "Yesterday's fixture" }),
      ...Array.from({ length: 10 }, (_, i) =>
        event(`f${i}`, `2026-09-${String(20 + i).padStart(2, "0")}`, { title: `Fixture ${i}` }),
      ),
      event("today", TODAY, { title: "Today's fixture", start_time: "19:45:00" }),
    ];
    renderPanel({ events });
    const rows = within(list()).getAllByText(/fixture|Fixture \d/);
    expect(rows[0]?.textContent).toBe("Today's fixture");
    expect(within(list()).queryByText("Yesterday's fixture")).toBeNull();
    expect(screen.getByText("Showing the next 8 of 11 scheduled.")).toBeTruthy();
  });

  it("turns the list into the picked day, logged interactions included, and back", () => {
    renderPanel({
      events: [
        event("a", "2026-09-25", { title: "Day fixture" }),
        event("b", "2026-09-30", { title: "Later fixture" }),
      ],
      interactions: [logged("i1", "2026-09-25", "Jordan Gk")],
    });
    fireEvent.click(screen.getByLabelText(/^2026-09-25/));

    expect(screen.getByRole("heading", { level: 3, name: "Friday 25 September" })).toBeTruthy();
    expect(within(list()).getByText("Day fixture")).toBeTruthy();
    expect(within(list()).queryByText("Later fixture")).toBeNull();
    const loggedRow = within(list()).getByText("Coffee Catch-up with Jordan Gk").closest("a");
    expect(loggedRow?.getAttribute("href")).toBe("/interactions/i1");
    expect(screen.getByLabelText(/^2026-09-25/).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /show upcoming/i }));
    expect(screen.getByRole("heading", { level: 3, name: "Upcoming" })).toBeTruthy();
    expect(within(list()).getByText("Later fixture")).toBeTruthy();
  });

  it("narrows the grid and the list together with one filter", () => {
    renderPanel({
      events: [
        event("m", "2026-09-22", { title: "A fixture" }),
        event("v", "2026-09-22", { title: "A visit", event_type: "Training Ground Visit" }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Fixtures" }));
    expect(screen.getByLabelText("2026-09-22 — 1 fixture")).toBeTruthy();
    expect(within(list()).getByText("A fixture")).toBeTruthy();
    expect(within(list()).queryByText("A visit")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Interactions" }));
    expect(screen.getByLabelText("2026-09-22 — 1 interaction booked")).toBeTruthy();
    expect(within(list()).getByText("A visit")).toBeTruthy();
    expect(within(list()).queryByText("A fixture")).toBeNull();
  });

  it("links an event to its goalkeeper's profile when the roster knows them", () => {
    renderPanel({
      events: [event("a", "2026-09-20", { title: "Known", goalkeeper_name: "Known Keeper" })],
      resolveGoalkeeper: (name) => (name === "Known Keeper" ? { id: "gk-1", tier: null } : null),
    });
    expect(within(list()).getByText("Known").closest("a")?.getAttribute("href")).toBe(
      "/goalkeepers/gk-1",
    );
  });

  it("pages months, clears the picked day, and carries the month into Open calendar", () => {
    renderPanel({ events: [event("a", "2026-09-25")] });
    fireEvent.click(screen.getByLabelText(/^2026-09-25/));
    fireEvent.click(screen.getByLabelText("Show October 2026"));
    expect(screen.getByText("October 2026")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Upcoming" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /open calendar/i }).getAttribute("href")).toBe(
      "/calendar?month=2026-10",
    );
  });

  it("totals only the visible month, not the adjacent-month days in the grid", () => {
    renderPanel({
      events: [event("a", "2026-08-31"), event("b", "2026-09-02"), event("c", "2026-10-01")],
      interactions: [logged("i1", "2026-09-03")],
    });
    expect(screen.getByText("1 event scheduled · 1 logged in September 2026")).toBeTruthy();
    // 31 Aug leads September's grid and 1 Oct trails it: blanks, not buttons.
    expect(screen.queryByLabelText(/2026-08-31/)).toBeNull();
    expect(screen.queryByLabelText(/2026-10-01/)).toBeNull();
  });

  it("does not report logged interactions as none while their read is in flight", () => {
    renderPanel({
      events: [event("a", "2026-09-25", { title: "Day fixture" })],
      interactions: undefined,
      interactionsPending: true,
    });
    expect(screen.getByText(/logged interactions loading in September 2026/)).toBeTruthy();
    expect(screen.queryByText(/0 logged/)).toBeNull();

    // The squares qualify what they know rather than claiming a day is empty.
    expect(
      screen.getByLabelText("2026-09-26 — nothing booked, logged interactions loading"),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("2026-09-25 — 1 fixture, logged interactions loading"),
    ).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/^2026-09-25/));
    expect(within(list()).getByText("Day fixture")).toBeTruthy();
    expect(within(list()).getByText("Loading logged interactions…")).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/^2026-09-26/));
    expect(within(list()).queryByText("Nothing on this day.")).toBeNull();
  });

  it("does not call a picked day empty while the calendar is still loading or failed", () => {
    const { rerender } = renderPanel({ events: undefined, pending: true });
    fireEvent.click(screen.getByLabelText(/^2026-09-26/));
    expect(within(list()).getByText("Loading calendar…")).toBeTruthy();
    expect(within(list()).queryByText("Nothing on this day.")).toBeNull();

    rerender(<TeamCalendarPanel events={undefined} pending={false} error today={TODAY} />);
    expect(within(list()).getByText("Calendar didn't load")).toBeTruthy();
    expect(within(list()).queryByText("Nothing on this day.")).toBeNull();
  });

  it("says when logged interactions failed to load", () => {
    renderPanel({ events: [], interactions: undefined, interactionsError: true });
    expect(
      screen.getByLabelText("2026-09-26 — nothing booked, logged interactions unavailable"),
    ).toBeTruthy();
    expect(screen.getByText(/logged interactions unavailable in September 2026/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/^2026-09-26/));
    expect(within(list()).getByText(/Logged interactions didn't load/)).toBeTruthy();
    expect(within(list()).queryByText("Nothing on this day.")).toBeNull();
  });

  it("says the calendar failed rather than rendering an empty month", () => {
    renderPanel({ events: undefined, error: true });
    expect(screen.getByRole("status").textContent).toMatch(/didn't load/i);
    expect(screen.queryByLabelText(/nothing on/)).toBeNull();
    expect(within(list()).getByText("Calendar didn't load")).toBeTruthy();
  });

  it("does not assert a count while the read is still in flight", () => {
    renderPanel({ events: undefined, pending: true });
    expect(screen.getByText("Loading events…")).toBeTruthy();
    expect(screen.queryByText(/scheduled ·/)).toBeNull();
    expect(within(list()).getByText("Loading calendar…")).toBeTruthy();
  });
});
