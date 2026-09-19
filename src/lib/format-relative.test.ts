import { describe, expect, it } from "vitest";
import { formatRelative } from "./mock-data";

/**
 * Anchored to a fixed Wednesday so "this week" and the year boundary are
 * testable without the clock moving underneath them. 15:00 London on
 * Wednesday 16 September 2026.
 */
const WEDNESDAY = Date.parse("2026-09-16T14:00:00Z");

describe("formatRelative — upcoming events", () => {
  it("names today and tomorrow the way people say them", () => {
    expect(formatRelative("2026-09-16", WEDNESDAY)).toBe("Today");
    expect(formatRelative("2026-09-17", WEDNESDAY)).toBe("Tomorrow");
  });

  it("uses the weekday for anything else inside the next week", () => {
    expect(formatRelative("2026-09-18", WEDNESDAY)).toBe("Friday");
    expect(formatRelative("2026-09-20", WEDNESDAY)).toBe("Sunday");
    // Six days out is still a weekday — the next seven days, not the calendar
    // week, so a Sunday in between does not flip it to a date.
    expect(formatRelative("2026-09-22", WEDNESDAY)).toBe("Tuesday");
  });

  it("switches to the date once the weekday would be ambiguous", () => {
    expect(formatRelative("2026-09-23", WEDNESDAY)).toBe("23 Sept");
    expect(formatRelative("2026-10-03", WEDNESDAY)).toBe("3 Oct");
  });

  it("adds the year only once the event leaves this one", () => {
    expect(formatRelative("2027-01-09", WEDNESDAY)).toBe("9 Jan 2027");
  });

  it("counts calendar days, so an evening fixture tomorrow is not 'Today'", () => {
    // 09:00 Wednesday looking at a 15:00 Thursday is 1.25 days by the clock but
    // one day on the calendar.
    const wednesdayMorning = Date.parse("2026-09-16T08:00:00Z");
    expect(formatRelative("2026-09-17T14:00:00Z", wednesdayMorning)).toBe("Tomorrow");
  });
});

describe("formatRelative — past dates keep their shorthand", () => {
  it("still reads back over a log in days and months", () => {
    expect(formatRelative("2026-09-15", WEDNESDAY)).toBe("Yesterday");
    expect(formatRelative("2026-09-10", WEDNESDAY)).toBe("6d ago");
    expect(formatRelative("2026-07-16", WEDNESDAY)).toBe("2mo ago");
  });
});

describe("formatRelative — non-dates", () => {
  it("passes through the roster's empty marker and anything unparseable", () => {
    expect(formatRelative("—", WEDNESDAY)).toBe("—");
    expect(formatRelative("", WEDNESDAY)).toBe("—");
    expect(formatRelative("not a date", WEDNESDAY)).toBe("not a date");
  });
});
