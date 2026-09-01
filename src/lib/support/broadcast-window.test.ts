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
    const clockRead = createSource.indexOf("const requestNow = Date.now()");
    const insert = createSource.indexOf('.from("announcements").insert');

    expect(createStart).toBeGreaterThanOrEqual(0);
    expect(createEnd).toBeGreaterThan(createStart);
    expect(readinessCheck).toBeGreaterThanOrEqual(0);
    expect(clockRead).toBeGreaterThan(readinessCheck);
    expect(insert).toBeGreaterThan(clockRead);
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
});
