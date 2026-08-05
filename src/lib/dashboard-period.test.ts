import { describe, expect, it } from "vitest";
import { isDateOnlyInPeriod, lastNDaysPeriod, toLocalDateOnly } from "./dashboard-period";

describe("dashboard period", () => {
  it("uses local calendar days, not the UTC slice of the instant", () => {
    const period = lastNDaysPeriod(14, new Date(2026, 7, 5, 0, 30));
    expect(period.toDate).toBe("2026-08-05");
    expect(period.fromDate).toBe("2026-07-22");
    expect(toLocalDateOnly(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("includes both boundary days", () => {
    expect(isDateOnlyInPeriod("2026-07-22", "2026-07-22", "2026-08-05")).toBe(true);
    expect(isDateOnlyInPeriod("2026-08-05", "2026-07-22", "2026-08-05")).toBe(true);
    expect(isDateOnlyInPeriod("2026-08-06", "2026-07-22", "2026-08-05")).toBe(false);
    expect(isDateOnlyInPeriod(null, "2026-07-22", "2026-08-05")).toBe(false);
  });
});
