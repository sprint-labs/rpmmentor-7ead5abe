import { describe, expect, it } from "vitest";
import {
  addHours,
  describeDeadlineDistance,
  formatLondonInstant,
  londonToday,
  londonWallClockMs,
} from "./london";

/** The instant a London wall clock reads a given time, as a UTC ISO string. */
function asUtc(dateIso: string, time: string | null): string {
  return new Date(londonWallClockMs(dateIso, time)).toISOString();
}

describe("londonWallClockMs", () => {
  it("treats winter times as UTC", () => {
    expect(asUtc("2026-01-15", "12:00")).toBe("2026-01-15T12:00:00.000Z");
  });

  it("shifts summer times by an hour for British Summer Time", () => {
    expect(asUtc("2026-08-15", "15:00")).toBe("2026-08-15T14:00:00.000Z");
  });

  it("handles the day the clocks go forward", () => {
    // BST begins 29 March 2026 at 01:00 UTC. 02:00 London that morning is 01:00 UTC.
    expect(asUtc("2026-03-29", "02:00")).toBe("2026-03-29T01:00:00.000Z");
    expect(asUtc("2026-03-28", "02:00")).toBe("2026-03-28T02:00:00.000Z");
  });

  it("handles the day the clocks go back", () => {
    // BST ends 25 October 2026. Midday that day is GMT again.
    expect(asUtc("2026-10-25", "12:00")).toBe("2026-10-25T12:00:00.000Z");
    expect(asUtc("2026-10-24", "12:00")).toBe("2026-10-24T11:00:00.000Z");
  });

  it("measures 48 hours as elapsed time across the autumn clock change", () => {
    // An 18:00 kick-off on Friday 23 October is 17:00 UTC under BST. Two days
    // later the clocks have gone back, so 48 elapsed hours reads 17:00 on the
    // London wall clock. That is the correct reading of "within 48 hours": the
    // mentor gets a full two days, not two days minus the hour the country
    // gained back.
    const start = londonWallClockMs("2026-10-23", "18:00");
    const deadline = addHours(start, 48);
    expect(deadline - start).toBe(48 * 3_600_000);
    expect(new Date(deadline).toISOString()).toBe("2026-10-25T17:00:00.000Z");
    expect(formatLondonInstant(deadline)).toContain("17:00");
  });

  it("falls back to the end of the day when no time is given", () => {
    expect(asUtc("2026-08-15", null)).toBe("2026-08-15T22:59:00.000Z");
    expect(asUtc("2026-08-15", "")).toBe("2026-08-15T22:59:00.000Z");
  });

  it("returns NaN for input that is not a calendar date", () => {
    expect(londonWallClockMs("15/08/2026", "15:00")).toBeNaN();
    expect(londonWallClockMs("", "15:00")).toBeNaN();
  });

  it("ignores a malformed time rather than shifting the day", () => {
    expect(asUtc("2026-08-15", "3pm")).toBe("2026-08-15T22:59:00.000Z");
  });
});

describe("londonToday", () => {
  it("reads the London calendar date, not the viewer's", () => {
    // 00:30 London on 15 August is still 23:30 UTC on the 14th.
    expect(londonToday(Date.parse("2026-08-14T23:30:00Z"))).toBe("2026-08-15");
  });
});

describe("describeDeadlineDistance", () => {
  const now = Date.parse("2026-08-15T12:00:00Z");

  it("counts down in hours, then days", () => {
    expect(describeDeadlineDistance(now + 6 * 3_600_000, now)).toBe("in 6 hours");
    expect(describeDeadlineDistance(now + 1 * 3_600_000, now)).toBe("in 1 hour");
    expect(describeDeadlineDistance(now + 72 * 3_600_000, now)).toBe("in 3 days");
  });

  it("reports a passed deadline in the past tense", () => {
    expect(describeDeadlineDistance(now - 5 * 3_600_000, now)).toBe("5 hours ago");
    expect(describeDeadlineDistance(now - 48 * 3_600_000, now)).toBe("2 days ago");
  });

  it("says nothing useful about an unreadable deadline", () => {
    expect(describeDeadlineDistance(NaN, now)).toBe("");
  });
});
