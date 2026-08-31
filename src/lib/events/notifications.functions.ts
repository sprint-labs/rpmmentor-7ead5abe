/**
 * The durable notification inbox.
 *
 * Row Level Security restricts every read to the signed-in recipient, so the
 * queries here carry no user filter of their own — a caller cannot ask for
 * somebody else's inbox even by trying.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserRoles, hasAnyRole } from "@/lib/roles.server";
import { FOLLOW_UP_MANAGE_ROLES } from "./follow-up.functions";
import type { NotificationKind } from "./notification-copy";

const INBOX_LIMIT = 60;
const INBOX_SCAN_LIMIT = 240;

export interface AppNotification {
  id: string;
  kind: NotificationKind | string;
  title: string;
  body: string;
  linkPath: string;
  createdAt: string;
  readAt: string | null;
  eventId: string | null;
}

export interface NotificationInbox {
  items: AppNotification[];
  unread: number;
}

/**
 * Durable overdue messages describe a derived state that can later change.
 * Keep the stored notification for audit/history, but only surface it while the
 * linked event is still currently overdue. This closes historical false alerts
 * without deleting or rewriting any notification rows.
 */
export function filterCurrentOverdueNotifications(
  items: readonly AppNotification[],
  currentOverdueEventIds: ReadonlySet<string>,
): AppNotification[] {
  return items.filter(
    (item) =>
      item.kind !== "follow_up_overdue" ||
      (Boolean(item.eventId) && currentOverdueEventIds.has(item.eventId as string)),
  );
}

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationInbox> => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, kind, title, body, link_path, created_at, read_at, calendar_event_id")
      .order("created_at", { ascending: false })
      // Scan beyond the visible page because stale derived overdue rows may be
      // filtered below; they must not crowd older, still-valid messages out.
      .limit(INBOX_SCAN_LIMIT);
    if (error) throw new Error(error.message);
    const storedItems: AppNotification[] = (data ?? []).map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      title: row.title as string,
      body: (row.body as string) ?? "",
      linkPath: (row.link_path as string) ?? "",
      createdAt: row.created_at as string,
      readAt: (row.read_at as string | null) ?? null,
      eventId: (row.calendar_event_id as string | null) ?? null,
    }));
    let items = storedItems;
    if (storedItems.some((item) => item.kind === "follow_up_overdue")) {
      const { loadEventFollowUps } = await import("./follow-up-query.server");
      // Notifications are already RLS-scoped to the caller. Resolve only their
      // own assigned events here, even when the caller also has a manager role.
      const current = await loadEventFollowUps(context.supabase, context.userId, false);
      const overdueIds = new Set(
        current
          .filter((row) => row.followUp.status === "overdue")
          .map((row) => row.eventId),
      );
      items = filterCurrentOverdueNotifications(storedItems, overdueIds);
    }
    items = items.slice(0, INBOX_LIMIT);
    return { items, unread: items.filter((i) => !i.readAt).length };
  });

/**
 * Mark the caller's notifications read.
 *
 * A database trigger allows nothing but `read_at` to change, so this cannot be
 * used to rewrite what somebody was told.
 */
export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { ids?: string[] } | undefined) => ({ ids: data?.ids ?? [] }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    let query = context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (data.ids.length > 0) query = query.in("id", data.ids);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Record an inbox alert for any write-up that has gone past its deadline.
 *
 * This project has no scheduled job, so a passed deadline is noticed when the app
 * is next used rather than pushed at the exact hour. The partial unique index on
 * `notifications` means calling this repeatedly produces exactly one alert per
 * mentor per event, so it is safe to run on every load.
 *
 * A mentor syncs only their own overdue work; a manager syncs everyone's, which
 * is what gets an alert into the inbox of a mentor who has not opened the app.
 * Neither depends on this for visibility: the Follow-ups page computes overdue
 * work live from the records themselves.
 */
export const syncOverdueFollowUpNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ created: number }> => {
    const { loadEventFollowUps } = await import("./follow-up-query.server");
    const { notifyFollowUpOverdue } = await import("./notify.server");

    const roles = await getUserRoles(context.supabase, context.userId);
    const canSeeEveryone = hasAnyRole(roles, FOLLOW_UP_MANAGE_ROLES);
    const rows = await loadEventFollowUps(context.supabase, context.userId, canSeeEveryone);

    const overdue = rows.filter((r) => r.followUp.status === "overdue" && r.assignedMentorId);
    let created = 0;
    for (const row of overdue) {
      const ok = await notifyFollowUpOverdue(context.supabase, context.userId, {
        id: row.eventId,
        title: row.title,
        event_type: row.eventType,
        event_date: row.eventDate,
        start_time: row.startTime,
        end_time: row.endTime,
        goalkeeper_name: row.goalkeeperName,
        player_id: row.playerId,
        participation_status: row.participationStatus,
        assigned_mentor_id: row.assignedMentorId,
      });
      if (ok) created += 1;
    }
    return { created };
  });
