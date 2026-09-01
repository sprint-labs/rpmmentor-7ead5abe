import { useEffect, useState } from "react";

export const ANNOUNCEMENT_CLOCK_INTERVAL_MS = 30_000;

/**
 * Keeps time-derived Broadcast states moving even when React Query returns
 * structurally identical rows at a scheduling or expiry boundary.
 */
export function useAnnouncementClock(): number {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), ANNOUNCEMENT_CLOCK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  return now;
}
