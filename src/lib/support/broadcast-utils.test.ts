import { describe, expect, it } from "vitest";
import { getBroadcastStatus, resolveBroadcastDates } from "@/lib/support/broadcast-utils";

describe("broadcast delivery helpers", () => {
  const now = new Date("2026-08-31T12:00:00.000Z");

  it("resolves immediate and scheduled delivery windows", () => {
    expect(
      resolveBroadcastDates({
        scheduleMode: "now",
        startsAtLocal: "",
        expiryMode: "24h",
        endsAtLocal: "",
        now,
      }),
    ).toEqual({ startsAt: null, endsAt: "2026-09-01T12:00:00.000Z" });

    expect(
      resolveBroadcastDates({
        scheduleMode: "later",
        startsAtLocal: "2026-08-31T15:00:00.000Z",
        expiryMode: "none",
        endsAtLocal: "",
        now,
      }),
    ).toEqual({ startsAt: "2026-08-31T15:00:00.000Z", endsAt: null });
  });

  it("rejects invalid timing", () => {
    expect(() =>
      resolveBroadcastDates({
        scheduleMode: "later",
        startsAtLocal: "2026-08-31T11:00:00.000Z",
        expiryMode: "none",
        endsAtLocal: "",
        now,
      }),
    ).toThrow("future");

    expect(() =>
      resolveBroadcastDates({
        scheduleMode: "now",
        startsAtLocal: "",
        expiryMode: "custom",
        endsAtLocal: "2026-08-31T11:00:00.000Z",
        now,
      }),
    ).toThrow("after");
  });

  it("classifies live, scheduled, ended and recent draft rows", () => {
    expect(
      getBroadcastStatus(
        {
          active: true,
          startsAt: "2026-08-31T11:00:00.000Z",
          endsAt: null,
          createdAt: "2026-08-31T10:00:00.000Z",
        },
        now,
      ),
    ).toBe("live");

    expect(
      getBroadcastStatus(
        {
          active: true,
          startsAt: "2026-08-31T13:00:00.000Z",
          endsAt: null,
          createdAt: "2026-08-31T10:00:00.000Z",
        },
        now,
      ),
    ).toBe("scheduled");

    expect(
      getBroadcastStatus(
        {
          active: false,
          startsAt: "2026-08-31T11:00:00.000Z",
          endsAt: null,
          createdAt: "2026-08-31T11:50:00.000Z",
        },
        now,
      ),
    ).toBe("draft");

    expect(
      getBroadcastStatus(
        {
          active: false,
          startsAt: "2026-08-30T11:00:00.000Z",
          endsAt: "2026-08-30T12:00:00.000Z",
          createdAt: "2026-08-30T10:00:00.000Z",
        },
        now,
      ),
    ).toBe("ended");

    expect(
      getBroadcastStatus(
        {
          active: false,
          startsAt: "2026-08-31T10:00:00.000Z",
          endsAt: null,
          createdAt: "2026-08-31T10:00:00.000Z",
        },
        now,
      ),
    ).toBe("draft");
  });
});
