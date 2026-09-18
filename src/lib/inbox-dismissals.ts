/**
 * Client-side resolution of durable inbox notifications.
 *
 * A database trigger allows nothing but `read_at` to change on a notification,
 * and nothing may delete one — the row is audit history of what somebody was
 * told. Resolving therefore marks the row read on the server and records the id
 * here, so the bell stops re-presenting a message the reader has finished with
 * even though the record itself is preserved.
 */
const STORAGE_KEY = "rpm.inbox.resolved.v1";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Resolved ids that still match a notification in the inbox. */
export function pruneResolvedInboxIds(
  resolved: readonly string[],
  presentIds: readonly string[],
): string[] {
  const present = new Set(presentIds);
  return [...new Set(resolved)].filter((id) => present.has(id));
}

export function loadResolvedInboxIds(userId: string): string[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(`${STORAGE_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveResolvedInboxIds(userId: string, ids: readonly string[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify([...new Set(ids)]));
  } catch {
    // A full or blocked store only costs the hidden state, never the inbox.
  }
}
