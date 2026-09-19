// @vitest-environment jsdom

import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";
import { CalendarMonthCard, type MonthCardEvent } from "@/components/calendar/month-card";

// The card only needs Link to render an anchor carrying its target; the router
// itself is not under test here.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search, ...rest }: Record<string, unknown>) => {
    const query = search as { month?: string } | undefined;
    return (
      <a href={`${String(to)}?month=${query?.month ?? ""}`} {...(rest as object)}>
        {children as React.ReactNode}
      </a>
    );
  },
}));

const TODAY = "2026-09-19";

function event(id: string, date: string, status = "scheduled"): MonthCardEvent {
  return { id, event_date: date, status };
}

// RTL only auto-cleans when vitest globals are enabled, which this repo does
// not do; without this every render leaks into the next test's queries.
afterEach(cleanup);

describe("CalendarMonthCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens on the month containing today and names it", () => {
    render(<CalendarMonthCard events={[]} pending={false} error={false} today={TODAY} />);
    expect(screen.getByText("September 2026")).toBeTruthy();
  });

  it("marks today, and only today", () => {
    render(<CalendarMonthCard events={[]} pending={false} error={false} today={TODAY} />);
    const marked = screen.getAllByRole("link").filter((el) => el.getAttribute("aria-current"));
    expect(marked).toHaveLength(1);
    expect(marked[0]?.getAttribute("aria-label")).toContain("2026-09-19");
    expect(marked[0]?.getAttribute("aria-label")).toContain("(today)");
  });

  it("counts real events per day in the label, cancellations excluded", () => {
    const events = [
      event("a", "2026-09-19"),
      event("b", "2026-09-19"),
      event("c", "2026-09-19", "cancelled"),
      event("d", "2026-09-21"),
    ];
    render(<CalendarMonthCard events={events} pending={false} error={false} today={TODAY} />);
    expect(screen.getByLabelText(/2026-09-19 — 2 events \(today\)/)).toBeTruthy();
    expect(screen.getByLabelText("2026-09-21 — 1 event")).toBeTruthy();
    // A day with only a cancelled event reads as having none.
    expect(screen.getByLabelText("2026-09-20 — no events")).toBeTruthy();
  });

  it("totals only the visible month, not the adjacent-month days in the grid", () => {
    // 31 August and 1 October both appear in September's grid as outside days.
    const events = [event("a", "2026-08-31"), event("b", "2026-09-02"), event("c", "2026-10-01")];
    render(<CalendarMonthCard events={events} pending={false} error={false} today={TODAY} />);
    expect(screen.getByText("1 event in September 2026")).toBeTruthy();
  });

  it("pages to another month and carries it into the open-calendar link", () => {
    render(<CalendarMonthCard events={[]} pending={false} error={false} today={TODAY} />);
    fireEvent.click(screen.getByLabelText("Show October 2026"));
    expect(screen.getByText("October 2026")).toBeTruthy();

    const open = screen.getByRole("link", { name: /open calendar/i });
    expect(open.getAttribute("href")).toBe("/calendar?month=2026-10");
  });

  it("pages backwards across a year boundary", () => {
    render(<CalendarMonthCard events={[]} pending={false} error={false} today="2026-01-15" />);
    fireEvent.click(screen.getByLabelText("Show December 2025"));
    expect(screen.getByText("December 2025")).toBeTruthy();
  });

  it("says the calendar failed rather than rendering an empty month", () => {
    // The regression this guards: an unreachable calendar drawn as a blank grid
    // is indistinguishable from "nothing is scheduled", which is a different
    // claim entirely.
    render(<CalendarMonthCard events={undefined} pending={false} error today={TODAY} />);
    expect(screen.getByRole("status").textContent).toMatch(/didn't load/i);
    expect(screen.queryByLabelText(/no events/)).toBeNull();
  });

  it("does not assert an event count while the read is still in flight", () => {
    render(<CalendarMonthCard events={undefined} pending error={false} today={TODAY} />);
    expect(screen.getByText("Loading events…")).toBeTruthy();
    expect(screen.queryByText(/events in September/)).toBeNull();
  });

  it("lays the week out Monday-first", () => {
    const { container } = render(
      <CalendarMonthCard events={[]} pending={false} error={false} today={TODAY} />,
    );
    const headings = within(container).getAllByText(/^[MTWFS]$/);
    expect(headings.slice(0, 7).map((el) => el.textContent)).toEqual([
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
      "S",
    ]);
  });
});
