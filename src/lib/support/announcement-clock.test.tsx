// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANNOUNCEMENT_CLOCK_INTERVAL_MS,
  ANNOUNCEMENT_CLOCK_SETTLE_MS,
  millisecondsUntilNextAnnouncementClockBoundary,
  useAnnouncementClock,
} from "./announcement-clock";

describe("useAnnouncementClock", () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("advances time-derived Broadcast state without changed query data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:35.000Z"));

    const { result } = renderHook(() => useAnnouncementClock());
    expect(result.current).toBe(Date.parse("2026-09-01T10:00:35.000Z"));

    act(() => {
      vi.advanceTimersByTime(25_249);
    });
    expect(result.current).toBe(Date.parse("2026-09-01T10:00:35.000Z"));

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(Date.parse("2026-09-01T10:01:00.250Z"));
  });

  it("calculates the next real scheduling boundary", () => {
    expect(
      millisecondsUntilNextAnnouncementClockBoundary(Date.parse("2026-09-01T10:00:35.250Z")),
    ).toBe(24_750 + ANNOUNCEMENT_CLOCK_SETTLE_MS);
    expect(
      millisecondsUntilNextAnnouncementClockBoundary(Date.parse("2026-09-01T10:01:00.000Z")),
    ).toBe(ANNOUNCEMENT_CLOCK_SETTLE_MS);
    expect(
      millisecondsUntilNextAnnouncementClockBoundary(Date.parse("2026-09-01T10:01:00.100Z")),
    ).toBe(150);
    expect(
      millisecondsUntilNextAnnouncementClockBoundary(Date.parse("2026-09-01T10:01:00.250Z")),
    ).toBe(ANNOUNCEMENT_CLOCK_INTERVAL_MS);
  });

  it("does not rerender callers when delivery is unavailable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00.000Z"));

    const { result } = renderHook(() => useAnnouncementClock(false));
    act(() => {
      vi.advanceTimersByTime(ANNOUNCEMENT_CLOCK_INTERVAL_MS * 2);
    });

    expect(result.current).toBe(Date.parse("2026-09-01T10:00:00.000Z"));
  });

  it("resynchronises immediately when delivery becomes available", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00.000Z"));

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useAnnouncementClock(enabled),
      { initialProps: { enabled: false } },
    );
    vi.setSystemTime(new Date("2026-09-01T10:00:12.000Z"));
    rerender({ enabled: true });

    expect(result.current).toBe(Date.parse("2026-09-01T10:00:12.000Z"));
  });

  it("pauses while hidden and resynchronises once on visibility restore", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00.000Z"));

    const { result } = renderHook(() => useAnnouncementClock());
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    act(() => vi.advanceTimersByTime(ANNOUNCEMENT_CLOCK_INTERVAL_MS * 2));
    expect(result.current).toBe(Date.parse("2026-09-01T10:00:00.000Z"));

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(result.current).toBe(Date.parse("2026-09-01T10:01:00.000Z"));
  });

  it("drives recipient refetch and delivery-window filtering at the same cadence", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/app-shell.tsx"), "utf8");
    expect(source).toContain("const announcementNow = useAnnouncementClock(canSeeSupport)");
    expect(source).toContain("const lastAnnouncementRefetchTick = useRef(announcementNow)");
    expect(source).toContain("if (announcementsFetching) return");
    expect(source).toContain("void refetchAnnouncements({ cancelRefetch: true })");
    expect(source).toContain("refetchOnWindowFocus: false");
    expect(source).not.toContain("refetchInterval:");
    expect(source).toContain("const updateAnnouncements = announcements");
  });
});
