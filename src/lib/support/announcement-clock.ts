import { useEffect, useRef, useState } from "react";

// Broadcast scheduling inputs are minute-precision. Aligning both the local
// clock and recipient refetches to real :00/:30 boundaries means a foreground
// recipient checks at the selected instant, rather than one mount-relative
// interval later. A small settle delay avoids querying just before the server
// reaches the same boundary.
export const ANNOUNCEMENT_CLOCK_INTERVAL_MS = 30_000;
export const ANNOUNCEMENT_CLOCK_SETTLE_MS = 250;

export function millisecondsUntilNextAnnouncementClockBoundary(nowMs = Date.now()): number {
  const remainder =
    ((nowMs % ANNOUNCEMENT_CLOCK_INTERVAL_MS) + ANNOUNCEMENT_CLOCK_INTERVAL_MS) %
    ANNOUNCEMENT_CLOCK_INTERVAL_MS;
  return remainder < ANNOUNCEMENT_CLOCK_SETTLE_MS
    ? ANNOUNCEMENT_CLOCK_SETTLE_MS - remainder
    : ANNOUNCEMENT_CLOCK_INTERVAL_MS - remainder + ANNOUNCEMENT_CLOCK_SETTLE_MS;
}

/**
 * Keeps time-derived Broadcast states moving even when React Query returns
 * structurally identical rows at a scheduling or expiry boundary.
 */
export function useAnnouncementClock(enabled = true): number {
  const [now, setNow] = useState(Date.now);
  const previousEnabled = useRef(enabled);

  useEffect(() => {
    const becameEnabled = enabled && !previousEnabled.current;
    previousEnabled.current = enabled;
    if (!enabled) return;
    if (becameEnabled && document.visibilityState === "visible") setNow(Date.now());

    let timeout: number | undefined;
    const scheduleNextBoundary = () => {
      if (document.visibilityState !== "visible") return;
      timeout = window.setTimeout(() => {
        if (document.visibilityState !== "visible") {
          timeout = undefined;
          return;
        }
        setNow(Date.now());
        scheduleNextBoundary();
      }, millisecondsUntilNextAnnouncementClockBoundary());
    };
    const syncVisibility = () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = undefined;
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      scheduleNextBoundary();
    };

    scheduleNextBoundary();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [enabled]);

  return now;
}
