// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCEMENT_CLOCK_INTERVAL_MS, useAnnouncementClock } from "./announcement-clock";

describe("useAnnouncementClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances time-derived Broadcast state without changed query data", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00.000Z"));

    const { result } = renderHook(() => useAnnouncementClock());
    expect(result.current).toBe(Date.parse("2026-09-01T10:00:00.000Z"));

    act(() => {
      vi.advanceTimersByTime(ANNOUNCEMENT_CLOCK_INTERVAL_MS);
    });

    expect(result.current).toBe(Date.parse("2026-09-01T10:00:30.000Z"));
  });
});
