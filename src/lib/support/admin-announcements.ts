/**
 * Admin Broadcast Centre listing helpers.
 *
 * Live and scheduled rows must always appear so a Super Admin can End them.
 * Ended history is a separate, capped page.
 */
export const ADMIN_RECENT_ANNOUNCEMENT_LIMIT = 50;

const ADMIN_DEFAULT_SCHEDULE_LEAD_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const FULL_HOUR_SEARCH_LIMIT_MINUTES = 24 * 60;

function dateTimeLocalRoundTrips(candidateMs: number): boolean {
  const candidate = new Date(candidateMs);
  return (
    new Date(
      candidate.getFullYear(),
      candidate.getMonth(),
      candidate.getDate(),
      candidate.getHours(),
      candidate.getMinutes(),
    ).getTime() === candidateMs
  );
}

/**
 * Keep the default at least an hour ahead while aligning it to a full local
 * hour. Rounding the target down can otherwise produce an immediately invalid
 * value when the composer opens near the end of an hour.
 */
export function nextAdminScheduleAt(nowMs: number): number {
  const earliestMs = nowMs + ADMIN_DEFAULT_SCHEDULE_LEAD_MS;
  let candidateMs = Math.ceil(earliestMs / MINUTE_MS) * MINUTE_MS;

  for (let offset = 0; offset <= FULL_HOUR_SEARCH_LIMIT_MINUTES; offset += 1) {
    const candidate = new Date(candidateMs);
    if (candidate.getMinutes() === 0 && dateTimeLocalRoundTrips(candidateMs)) return candidateMs;
    candidateMs += MINUTE_MS;
  }

  throw new Error("Broadcast default schedule could not be calculated.");
}

/**
 * Native datetime-local inputs have minute precision and discard the timezone
 * offset. Return the first selectable minute strictly beyond the scheduling
 * lead that parses back to the same instant, including across DST fall-backs.
 */
export function nextAdminScheduleInputMinAt(nowMs: number, minimumLeadMs: number): number {
  const earliestMs = nowMs + minimumLeadMs;
  let candidateMs = (Math.floor(earliestMs / MINUTE_MS) + 1) * MINUTE_MS;

  for (let offset = 0; offset <= FULL_HOUR_SEARCH_LIMIT_MINUTES; offset += 1) {
    if (dateTimeLocalRoundTrips(candidateMs)) return candidateMs;
    candidateMs += MINUTE_MS;
  }

  throw new Error("Broadcast scheduling minimum could not be calculated.");
}

/**
 * Advance the server classification clock by elapsed client time. React Query's
 * dataUpdatedAt and clientNow use the same workstation clock, so their
 * difference is stable even when that clock is skewed from the server.
 */
export function estimateAdminServerNow(
  serverNow: string | undefined,
  dataUpdatedAt: number,
  clientNow: number,
): number {
  const serverNowMs = serverNow ? Date.parse(serverNow) : Number.NaN;
  if (!Number.isFinite(serverNowMs) || dataUpdatedAt <= 0) return clientNow;
  return serverNowMs + Math.max(0, clientNow - dataUpdatedAt);
}

/**
 * Advance a fresh server sample with monotonic elapsed time. This avoids using
 * the workstation wall clock for publication boundaries, including when the
 * admin listing is empty and cannot carry its per-row server timestamp.
 */
export function advanceAdminServerNow(
  serverNow: string,
  monotonicElapsedMs: number,
  wallElapsedMs = monotonicElapsedMs,
): number {
  const serverNowMs = Date.parse(serverNow);
  if (!Number.isFinite(serverNowMs)) {
    throw new Error("Broadcast timing could not be verified. Refresh and try again.");
  }
  const monotonic = Number.isFinite(monotonicElapsedMs) ? monotonicElapsedMs : 0;
  const wall = Number.isFinite(wallElapsedMs) ? wallElapsedMs : 0;
  return serverNowMs + Math.max(0, monotonic, wall);
}

export function mergeAdminAnnouncementPages<T extends { id: string }>(
  current: T[],
  recent: T[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of [...current, ...recent]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}
