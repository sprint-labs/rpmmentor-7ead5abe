import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveBroadcastWindow,
  resolveServerBroadcastWindow,
  validateResolvedBroadcastWindow,
} from "./broadcast-window";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");

describe("Broadcast delivery windows", () => {
  it("keeps the authoritative server clock after the final readiness await", () => {
    const source = readFileSync(new URL("../support.functions.ts", import.meta.url), "utf8");
    const createStart = source.indexOf("export const createAnnouncement");
    const createEnd = source.indexOf("export const endAnnouncement", createStart);
    const createSource = source.slice(createStart, createEnd);
    const readinessCheck = createSource.indexOf("requireAnnouncementMediaStorageReady");
    const storageVerification = createSource.indexOf("verifyStoredAnnouncementAttachment");
    const clockRead = createSource.indexOf("const requestNow = Date.now()");
    const insert = createSource.indexOf('.from("announcements").insert');

    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(createEnd).toBeGreaterThan(createStart);
    expect(readinessCheck).toBeGreaterThanOrEqual(0);
    expect(storageVerification).toBeGreaterThan(readinessCheck);
    expect(clockRead).toBeGreaterThan(storageVerification);
    expect(insert).toBeGreaterThan(clockRead);
  });

  it("records a stable terminal event before capping recent Broadcasts", () => {
    const source = readFileSync(new URL("../support.functions.ts", import.meta.url), "utf8");
    const listStart = source.indexOf("export const listAdminAnnouncements");
    const clockStart = source.indexOf("export const getAdminAnnouncementClock", listStart);
    const endStart = source.indexOf("export const endAnnouncement", clockStart);
    const listSource = source.slice(listStart, clockStart);
    const endSource = source.slice(endStart);

    expect(
      listSource.match(/\.order\("ends_at", \{ ascending: false, nullsFirst: false \}\)/g),
    ).toHaveLength(2);
    expect(endSource).toContain("Date.parse(existingAnnouncement.ends_at) <= nowMs");
    expect(endSource).toContain("ends_at: nowIso");
    expect(endSource).toContain('.eq("active", true)');
    expect(endSource).toContain("ends_at.gt.${nowIso}");
    expect(endSource).toContain("const { data: terminal, error: terminalError }");
  });

  it("revalidates a scheduled start against the current time", () => {
    const input = {
      publishMode: "later" as const,
      startsAt: "2026-09-01T12:00:31.000Z",
      expiryMode: "none" as const,
      endsAt: "",
    };

    expect(resolveBroadcastWindow(input, NOW).scheduled).toBe(true);
    expect(() => resolveBroadcastWindow(input, NOW + 2_000)).toThrow(
      "Scheduled broadcasts need a future publish time.",
    );
  });

  it("revalidates a custom expiry after time-consuming work", () => {
    const input = {
      publishMode: "now" as const,
      startsAt: "",
      expiryMode: "custom" as const,
      endsAt: "2026-09-01T12:00:05.000Z",
    };

    expect(resolveBroadcastWindow(input, NOW).endsAt).toBe(input.endsAt);
    expect(() => resolveBroadcastWindow(input, NOW + 6_000)).toThrow(
      "The end time must be after the publish time.",
    );
  });

  it("rejects a nonexistent local publish time instead of normalising it", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Europe/London";

    try {
      expect(() =>
        resolveBroadcastWindow(
          {
            publishMode: "later",
            startsAt: "2027-03-28T01:30",
            expiryMode: "none",
            endsAt: "",
          },
          Date.parse("2027-03-27T12:00:00.000Z"),
        ),
      ).toThrow("Choose a valid publish time.");
      expect(
        resolveBroadcastWindow(
          {
            publishMode: "later",
            startsAt: "2027-03-28T02:30",
            expiryMode: "none",
            endsAt: "",
          },
          Date.parse("2027-03-27T12:00:00.000Z"),
        ).startsAt,
      ).toBe("2027-03-28T01:30:00.000Z");
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("rejects a nonexistent local custom expiry instead of normalising it", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Europe/London";

    try {
      expect(() =>
        resolveBroadcastWindow(
          {
            publishMode: "now",
            startsAt: "",
            expiryMode: "custom",
            endsAt: "2027-03-28T01:30",
          },
          Date.parse("2027-03-27T12:00:00.000Z"),
        ),
      ).toThrow("Choose a valid end time.");
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  it("rejects normalised calendar values while preserving explicit instants", () => {
    expect(() =>
      resolveBroadcastWindow(
        {
          publishMode: "later",
          startsAt: "2027-02-30T12:00",
          expiryMode: "none",
          endsAt: "",
        },
        Date.parse("2027-02-01T12:00:00.000Z"),
      ),
    ).toThrow("Choose a valid publish time.");
    expect(
      resolveBroadcastWindow(
        {
          publishMode: "later",
          startsAt: "2027-03-28T01:30:00.000Z",
          expiryMode: "none",
          endsAt: "",
        },
        Date.parse("2027-03-27T12:00:00.000Z"),
      ).startsAt,
    ).toBe("2027-03-28T01:30:00.000Z");
  });

  it("anchors relative expiry to the final publish-now timestamp", () => {
    const resolved = resolveBroadcastWindow(
      { publishMode: "now", startsAt: "", expiryMode: "24h", endsAt: "" },
      NOW + 10_000,
    );

    expect(resolved.startsAt).toBe("2026-09-01T12:00:10.000Z");
    expect(resolved.endsAt).toBe("2026-09-02T12:00:10.000Z");
  });

  it("rejects a stale scheduled request at the server boundary", () => {
    expect(() =>
      validateResolvedBroadcastWindow(
        {
          scheduled: true,
          startsAt: "2026-09-01T12:00:20.000Z",
          endsAt: null,
        },
        NOW,
      ),
    ).toThrow("Scheduled broadcasts need a future publish time.");
  });

  it("keeps cached pre-discriminator publish-now clients compatible", () => {
    const resolved = resolveServerBroadcastWindow(
      {
        startsAt: "2026-09-01T11:59:58.000Z",
        endsAt: "2026-09-02T12:00:00.000Z",
      },
      NOW,
    );

    expect(resolved).toEqual({
      scheduled: false,
      startsAt: "2026-09-01T11:59:58.000Z",
      endsAt: "2026-09-02T12:00:00.000Z",
    });
  });

  it("recognises a future schedule from a cached pre-discriminator client", () => {
    const resolved = resolveServerBroadcastWindow(
      { startsAt: "2026-09-01T12:01:00.000Z", endsAt: null },
      NOW,
    );

    expect(resolved.scheduled).toBe(true);
    expect(resolved.startsAt).toBe("2026-09-01T12:01:00.000Z");
  });

  it("preserves a near future legacy schedule instead of publishing it early", () => {
    const resolved = resolveServerBroadcastWindow(
      { startsAt: "2026-09-01T12:00:20.000Z", endsAt: null },
      NOW,
    );

    expect(resolved.scheduled).toBe(true);
    expect(resolved.startsAt).toBe("2026-09-01T12:00:20.000Z");
  });

  it("uses strict semantics when the client sends an explicit mode", () => {
    expect(
      resolveServerBroadcastWindow(
        {
          publishMode: "now",
          startsAt: "2026-09-01T12:01:00.000Z",
          endsAt: null,
        },
        NOW,
      ).startsAt,
    ).toBe("2026-09-01T12:00:00.000Z");

    expect(() =>
      resolveServerBroadcastWindow(
        {
          publishMode: "later",
          startsAt: "2026-09-01T12:00:20.000Z",
          endsAt: null,
        },
        NOW,
      ),
    ).toThrow("Scheduled broadcasts need a future publish time.");
  });

  it("anchors publish-now preset expiry to the authoritative server clock", () => {
    const resolved = resolveServerBroadcastWindow(
      {
        publishMode: "now",
        expiryMode: "24h",
        // A skewed browser may still submit stale absolute values. Presets
        // deliberately ignore them and derive from the server start.
        startsAt: "2026-09-01T14:00:00.000Z",
        endsAt: "2026-09-02T14:00:00.000Z",
      },
      NOW,
    );

    expect(resolved).toEqual({
      scheduled: false,
      startsAt: "2026-09-01T12:00:00.000Z",
      endsAt: "2026-09-02T12:00:00.000Z",
    });
  });

  it("sends preset intent instead of a browser-derived absolute expiry", () => {
    const source = readFileSync(
      new URL("../../components/broadcast-centre.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("expiryMode,");
    expect(source).toContain("endsAt: delivery.endsAt");
  });

  it("derives scheduled preset expiry from the accepted schedule", () => {
    const resolved = resolveServerBroadcastWindow(
      {
        publishMode: "later",
        expiryMode: "7d",
        startsAt: "2026-09-01T12:01:00.000Z",
        endsAt: null,
      },
      NOW,
    );

    expect(resolved.endsAt).toBe("2026-09-08T12:01:00.000Z");
  });

  it("preserves an absolute fallback when an explicit older client omits expiryMode", () => {
    const resolved = resolveServerBroadcastWindow(
      {
        publishMode: "now",
        endsAt: "2026-09-02T12:00:00.000Z",
      },
      NOW,
    );

    expect(resolved.endsAt).toBe("2026-09-02T12:00:00.000Z");
  });

  it("rejects custom expiry without an absolute end at the resolver boundary", () => {
    expect(() =>
      resolveServerBroadcastWindow(
        {
          publishMode: "now",
          expiryMode: "custom",
          endsAt: null,
        },
        NOW,
      ),
    ).toThrow("Choose a valid end time.");
  });
});
