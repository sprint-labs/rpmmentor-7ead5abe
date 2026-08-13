/**
 * Shared React Query keys for event follow-ups and notifications.
 *
 * Kept in one client-safe module so every surface that reads a follow-up status
 * and every write path that could change one agree on the key. A status that
 * lives in a cache under a key nobody remembers to invalidate is how a
 * "Completed" write-up carries on reading as overdue.
 */
export const eventFollowUpsQueryKey = ["events", "follow-ups"] as const;
export const notificationsQueryKey = ["notifications", "inbox"] as const;
