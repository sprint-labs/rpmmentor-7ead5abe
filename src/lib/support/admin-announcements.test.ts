import { describe, expect, it } from "vitest";
import {
  ADMIN_RECENT_ANNOUNCEMENT_LIMIT,
  advanceAdminServerNow,
  estimateAdminServerNow,
  mergeAdminAnnouncementPages,
  nextAdminScheduleAt,
  nextAdminScheduleInputMinAt,
} from "./admin-announcements";

describe("nextAdminScheduleAt", () => {
  it("rounds an hour-ahead target up near the end of an hour", () => {
    const now = new Date(2026, 8, 1, 13, 59, 45);
    const scheduled = new Date(nextAdminScheduleAt(now.getTime()));

    expect(scheduled.getTime()).toBeGreaterThanOrEqual(now.getTime() + 60 * 60 * 1000);
    expect([scheduled.getMinutes(), scheduled.getSeconds(), scheduled.getMilliseconds()]).toEqual([
      0, 0, 0,
    ]);
  });

  it("keeps an exact full-hour target", () => {
    const now = new Date(2026, 8, 1, 13);
    expect(nextAdminScheduleAt(now.getTime())).toBe(now.getTime() + 60 * 60 * 1000);
  });

  it("never moves inside the one-hour lead across a DST fall-back", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Pacific/Chatham";

    try {
      const now = Date.parse("2026-04-04T13:14:45.000Z");
      const scheduled = new Date(nextAdminScheduleAt(now));
      const parsedFromDateTimeLocal = new Date(
        scheduled.getFullYear(),
        scheduled.getMonth(),
        scheduled.getDate(),
        scheduled.getHours(),
        scheduled.getMinutes(),
      );

      expect(parsedFromDateTimeLocal.getTime()).toBe(scheduled.getTime());
      expect(parsedFromDateTimeLocal.getTime()).toBeGreaterThanOrEqual(now + 60 * 60 * 1000);
      expect(scheduled.getMinutes()).toBe(0);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
});

describe("nextAdminScheduleInputMinAt", () => {
  it("selects the first minute strictly beyond the lead boundary", () => {
    const now = new Date(2026, 8, 1, 13, 59, 30);
    const minimum = new Date(nextAdminScheduleInputMinAt(now.getTime(), 30_000));

    expect(minimum.getTime()).toBeGreaterThan(now.getTime() + 30_000);
    expect([minimum.getMinutes(), minimum.getSeconds(), minimum.getMilliseconds()]).toEqual([
      1, 0, 0,
    ]);
  });

  it("survives an offset-free round-trip across a DST fall-back", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Pacific/Chatham";

    try {
      // Pacific/Chatham repeats 02:45-03:44 here. A naive 02:46 local
      // minimum would parse to the first occurrence, an hour in the past.
      const now = Date.parse("2026-04-04T14:00:00.000Z");
      const minimum = new Date(nextAdminScheduleInputMinAt(now, 30_000));
      const parsedFromDateTimeLocal = new Date(
        minimum.getFullYear(),
        minimum.getMonth(),
        minimum.getDate(),
        minimum.getHours(),
        minimum.getMinutes(),
      );

      expect(parsedFromDateTimeLocal.getTime()).toBe(minimum.getTime());
      expect(parsedFromDateTimeLocal.getTime()).toBeGreaterThan(now + 30_000);
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
});

describe("estimateAdminServerNow", () => {
  it("ignores a workstation clock that is hours ahead of the server", () => {
    const workstationReceivedAt = Date.parse("2026-09-01T14:00:00.000Z");
    expect(
      estimateAdminServerNow(
        "2026-09-01T10:00:00.000Z",
        workstationReceivedAt,
        workstationReceivedAt + 30_000,
      ),
    ).toBe(Date.parse("2026-09-01T10:00:30.000Z"));
  });

  it("falls back to client time for an older cached list response", () => {
    expect(estimateAdminServerNow(undefined, 0, 123_456)).toBe(123_456);
  });
});

describe("advanceAdminServerNow", () => {
  it("advances a standalone server sample without consulting the workstation clock", () => {
    expect(advanceAdminServerNow("2026-09-01T10:00:00.000Z", 45_000)).toBe(
      Date.parse("2026-09-01T10:00:45.000Z"),
    );
  });

  it("does not move backwards when a monotonic sample is reset", () => {
    expect(advanceAdminServerNow("2026-09-01T10:00:00.000Z", -1)).toBe(
      Date.parse("2026-09-01T10:00:00.000Z"),
    );
  });

  it("uses wall elapsed time when a monotonic clock pauses during sleep", () => {
    expect(advanceAdminServerNow("2026-09-01T10:00:00.000Z", 1_000, 60_000)).toBe(
      Date.parse("2026-09-01T10:01:00.000Z"),
    );
  });

  it("fails closed when the server clock response is invalid", () => {
    expect(() => advanceAdminServerNow("invalid", 0)).toThrow(
      "Broadcast timing could not be verified. Refresh and try again.",
    );
  });
});

describe("mergeAdminAnnouncementPages", () => {
  it("keeps an older live broadcast that would miss a newest-50 history page", () => {
    const stickyIncident = { id: "sticky-incident" };
    const recentEnded = Array.from({ length: ADMIN_RECENT_ANNOUNCEMENT_LIMIT }, (_, index) => ({
      id: `ended-${index}`,
    }));

    const merged = mergeAdminAnnouncementPages([stickyIncident], recentEnded);

    expect(merged[0]).toEqual(stickyIncident);
    expect(merged).toHaveLength(ADMIN_RECENT_ANNOUNCEMENT_LIMIT + 1);
    expect(merged.map((row) => row.id)).toContain("sticky-incident");
  });

  it("does not duplicate a row that appears on both pages", () => {
    const shared = { id: "shared" };
    expect(mergeAdminAnnouncementPages([shared], [shared, { id: "ended" }])).toEqual([
      shared,
      { id: "ended" },
    ]);
  });
});
