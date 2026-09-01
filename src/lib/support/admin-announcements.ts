/**
 * Admin Broadcast Centre listing helpers.
 *
 * Live and scheduled rows must always appear so a Super Admin can End them.
 * Ended history is a separate, capped page.
 */
export const ADMIN_RECENT_ANNOUNCEMENT_LIMIT = 50;

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

export function endedAtForAnnouncement(startsAt: string, nowIso: string): string | null {
  return Date.parse(startsAt) < Date.parse(nowIso) ? nowIso : null;
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
