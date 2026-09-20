// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MentorMonthPanel, type MentorMonthEvent } from "./mentor-month-panel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    search?: unknown;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

/** A fixed month so the grid under test never depends on the wall clock.
 *  The panel opens on the month `today` falls in, so this pins the grid. */
const TODAY = "2027-03-15";

function event(overrides: Partial<MentorMonthEvent> = {}): MentorMonthEvent {
  return {
    id: "e1",
    event_date: TODAY,
    start_time: "15:00:00",
    title: "Stevenage v Sheffield Wednesday",
    event_type: "Match",
    goalkeeper_name: "Joe Lumley",
    status: "scheduled",
    ...overrides,
  };
}

describe("MentorMonthPanel", () => {
  it("names the time and the goalkeeper on the day's square", () => {
    render(<MentorMonthPanel events={[event()]} pending={false} error={false} today={TODAY} />);

    // The square's accessible name carries the detail; the chip repeats it.
    const day = screen.getByRole("link", { name: /2027-03-15 — 15:00 Joe Lumley \(today\)/ });
    expect(day).not.toBeNull();
    expect(day.getAttribute("aria-current")).toBe("date");
  });

  it("falls back to the event title when no goalkeeper is linked", () => {
    render(
      <MentorMonthPanel
        events={[event({ goalkeeper_name: null })]}
        pending={false}
        error={false}
        today={TODAY}
      />,
    );

    expect(
      screen.getByRole("link", { name: /15:00 Stevenage v Sheffield Wednesday/ }),
    ).not.toBeNull();
  });

  it("counts the entries a square has no room to name", () => {
    const events = [
      event({ id: "a", start_time: "09:00:00", goalkeeper_name: "A Keeper" }),
      event({ id: "b", start_time: "12:00:00", goalkeeper_name: "B Keeper" }),
      event({ id: "c", start_time: "15:00:00", goalkeeper_name: "C Keeper" }),
    ];
    render(<MentorMonthPanel events={events} pending={false} error={false} today={TODAY} />);

    // Two are named on the face of the square, the third is counted.
    expect(screen.getByText("+1 more")).not.toBeNull();
    // Every one of them is still in the square's accessible name.
    expect(screen.getByRole("link", { name: /C Keeper/ })).not.toBeNull();
  });

  it("leaves cancelled events out of the month", () => {
    render(
      <MentorMonthPanel
        events={[event({ status: "cancelled" })]}
        pending={false}
        error={false}
        today={TODAY}
      />,
    );

    expect(screen.getByRole("link", { name: /2027-03-15 — nothing scheduled/ })).not.toBeNull();
  });

  it("names the colour ramp rather than leaving the dots to be guessed", () => {
    render(<MentorMonthPanel events={[event()]} pending={false} error={false} today={TODAY} />);

    for (const label of ["Match", "Training ground", "Catch-up"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
  });

  it("says the calendar is unavailable rather than drawing an empty month", () => {
    render(<MentorMonthPanel events={undefined} pending={false} error today={TODAY} />);

    expect(screen.getByRole("status").textContent).toContain("didn't load");
    expect(screen.queryByRole("link", { name: /nothing scheduled/ })).toBeNull();
  });
});
