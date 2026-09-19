import { describe, it, expect } from "vitest";
import {
  formatMonthParam,
  isSameMonth,
  localDateIso,
  monthGrid,
  monthLabel,
  monthOf,
  parseMonthParam,
  shiftMonth,
} from "@/lib/calendar/month";

const SEP_2026 = { year: 2026, month: 9 };

describe("parseMonthParam", () => {
  it("reads a well-formed month", () => {
    expect(parseMonthParam("2026-09", SEP_2026)).toEqual({ year: 2026, month: 9 });
  });

  it("falls back rather than throwing on rubbish, so a mangled link still opens", () => {
    for (const bad of ["", "   ", "2026-13", "2026-00", "2026-9", "not-a-month", undefined, null]) {
      expect(parseMonthParam(bad, SEP_2026)).toEqual(SEP_2026);
    }
  });

  it("round-trips through the URL form", () => {
    const cursor = { year: 2027, month: 1 };
    expect(parseMonthParam(formatMonthParam(cursor), SEP_2026)).toEqual(cursor);
    expect(formatMonthParam(cursor)).toBe("2027-01");
  });
});

describe("shiftMonth", () => {
  it("moves within a year", () => {
    expect(shiftMonth(SEP_2026, 1)).toEqual({ year: 2026, month: 10 });
    expect(shiftMonth(SEP_2026, -1)).toEqual({ year: 2026, month: 8 });
  });

  it("rolls over the year boundary in both directions", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("handles multi-year jumps", () => {
    expect(shiftMonth(SEP_2026, 12)).toEqual({ year: 2027, month: 9 });
    expect(shiftMonth(SEP_2026, -20)).toEqual({ year: 2025, month: 1 });
  });
});

describe("monthGrid", () => {
  it("always returns a fixed six rows so the card cannot change height", () => {
    for (const cursor of [SEP_2026, { year: 2026, month: 2 }, { year: 2024, month: 2 }]) {
      expect(monthGrid(cursor)).toHaveLength(42);
    }
  });

  it("starts the week on Monday", () => {
    // 1 September 2026 is a Tuesday, so Monday 31 August leads the grid.
    const cells = monthGrid(SEP_2026);
    expect(cells[0]).toEqual({ iso: "2026-08-31", day: 31, inMonth: false });
    expect(cells[1]).toEqual({ iso: "2026-09-01", day: 1, inMonth: true });
  });

  it("marks adjacent-month days as outside the month", () => {
    const cells = monthGrid(SEP_2026);
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0]?.iso).toBe("2026-09-01");
    expect(inMonth[29]?.iso).toBe("2026-09-30");
    // Everything after the 30th belongs to October and must be greyed.
    expect(cells[cells.length - 1]?.inMonth).toBe(false);
  });

  it("handles a leap February", () => {
    const inMonth = monthGrid({ year: 2024, month: 2 }).filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[28]?.iso).toBe("2024-02-29");
  });

  it("handles a non-leap February", () => {
    const inMonth = monthGrid({ year: 2026, month: 2 }).filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(28);
  });

  it("crosses the year boundary in the trailing row", () => {
    const cells = monthGrid({ year: 2026, month: 12 });
    const trailing = cells.filter((c) => !c.inMonth && c.iso > "2026-12-01");
    expect(trailing.every((c) => c.iso.startsWith("2027-01"))).toBe(true);
  });

  it("produces strictly consecutive dates with no gaps or repeats", () => {
    const cells = monthGrid(SEP_2026);
    const seen = new Set(cells.map((c) => c.iso));
    expect(seen.size).toBe(42);
    for (let i = 1; i < cells.length; i++) {
      const prev = new Date(`${cells[i - 1]!.iso}T12:00:00`);
      const cur = new Date(`${cells[i]!.iso}T12:00:00`);
      expect(Math.round((+cur - +prev) / 86_400_000)).toBe(1);
    }
  });

  it("does not shift a day across a British Summer Time transition", () => {
    // BST ends on 25 October 2026. A grid built via UTC midnights loses or
    // repeats a day here; one built from local fields does not.
    const cells = monthGrid({ year: 2026, month: 10 });
    const octoberDays = cells.filter((c) => c.inMonth).map((c) => c.iso);
    expect(octoberDays).toContain("2026-10-24");
    expect(octoberDays).toContain("2026-10-25");
    expect(octoberDays).toContain("2026-10-26");
    expect(octoberDays).toHaveLength(31);
  });
});

describe("localDateIso / monthOf", () => {
  it("uses local calendar fields, not UTC", () => {
    // 23:30 local on the 19th. Going via toISOString() in any timezone west of
    // UTC would render the 19th as the 20th, or vice versa.
    const d = new Date(2026, 8, 19, 23, 30);
    expect(localDateIso(d)).toBe("2026-09-19");
    expect(monthOf(d)).toEqual(SEP_2026);
  });
});

describe("monthLabel / isSameMonth", () => {
  it("names the month in full", () => {
    expect(monthLabel(SEP_2026)).toBe("September 2026");
    expect(monthLabel({ year: 2027, month: 1 })).toBe("January 2027");
  });

  it("compares month and year together", () => {
    expect(isSameMonth(SEP_2026, { year: 2026, month: 9 })).toBe(true);
    expect(isSameMonth(SEP_2026, { year: 2025, month: 9 })).toBe(false);
    expect(isSameMonth(SEP_2026, { year: 2026, month: 10 })).toBe(false);
  });
});
