/**
 * Admin Broadcast Centre listing helpers.
 *
 * Live and scheduled rows must always appear so a Super Admin can End them.
 * Ended history is a separate, capped page.
 */
export const ADMIN_RECENT_ANNOUNCEMENT_LIMIT = 50;

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
