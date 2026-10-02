/**
 * Server functions for event follow-ups.
 *
 * Reads go through the CALLER's authenticated client, so Row Level Security
 * decides what is visible. Every signed-in operational role can already read the
 * calendar, interactions and the canonical Match Report store, so no privileged
 * client is needed to work out what has and has not been written up.
 *
 * Status is computed from persisted rows on every read. Nothing is cached in a
 * column that could disagree with the records themselves, which is why a status
 * survives a refresh and a new sign-in, and why withdrawing a Match Report
 * correctly reopens the requirement it had satisfied.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getUserRoles, hasAnyRole, requireRole, type AppRole } from "@/lib/roles.server";
import type { EventFollowUpRow } from "./follow-up-query.server";
import type { CancellationNotificationResult } from "./notification-copy";

/** Roles that may cancel an event or waive its write-up. */
export const FOLLOW_UP_MANAGE_ROLES: readonly AppRole[] = [
  "mentor_manager",
  "admin",
  "super_admin",
];

/**
 * Roles that may waive the write-up on an event assigned to themselves: the
 * roles that do mentoring work of their own (mirrors `INTERACTION_LOG_ROLES`).
 */
export const FOLLOW_UP_SELF_WAIVE_ROLES: readonly AppRole[] = [
  "mentor",
  "mentor_manager",
  "super_admin",
];

/**
 * Throws unless `userId` may waive this event's write-up themselves: the event
 * exists, is assigned to them, is not cancelled and is not already waived.
 */
export function assertSelfWaivable(
  event: {
    assigned_mentor_id: string | null;
    status: string;
    follow_up_waived_at: string | null;
  } | null,
  userId: string,
): void {
  if (!event || event.assigned_mentor_id !== userId) {
    throw new Error("You can only remove write-ups for events assigned to you.");
  }
  if (event.status === "cancelled") {
    throw new Error("This event was cancelled, so no write-up is due.");
  }
  if (event.follow_up_waived_at) {
    throw new Error("This write-up has already been marked not required.");
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type { EventFollowUpRow };

export interface EventFollowUpList {
  rows: EventFollowUpRow[];
  /** True when the caller can see other mentors' outstanding work. */
  canSeeEveryone: boolean;
  /** True when the caller may cancel events and waive requirements. */
  canManage: boolean;
}

/**
 * Every event follow-up the caller is entitled to see.
 *
 * A mentor sees the events assigned to them. A mentor manager, admin or super
 * admin sees all of them, which is what stops a missing write-up disappearing
 * quietly.
 */
export const listEventFollowUps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EventFollowUpList> => {
    const { loadEventFollowUps } = await import("./follow-up-query.server");
    const roles = await getUserRoles(context.supabase, context.userId);
    const canManage = hasAnyRole(roles, FOLLOW_UP_MANAGE_ROLES);
    const rows = await loadEventFollowUps(context.supabase, context.userId, canManage);
    return { rows, canSeeEveryone: canManage, canManage };
  });

/**
 * Cancel an event.
 *
 * The event is marked, never deleted, so what was planned stays on the record.
 * Its outstanding write-up closes as a consequence of the status rather than by
 * editing a second row, and the assigned mentor is told it has gone away.
 */
export const cancelCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; reason?: string }) => {
    if (!UUID_RE.test(data?.id ?? "")) throw new Error("An event id is required.");
    const reason = (data.reason ?? "").trim();
    if (reason.length > 500) throw new Error("Reason must be 500 characters or fewer.");
    return { id: data.id, reason };
  })
  .handler(async ({ data, context }): Promise<{
    ok: true;
    notification: CancellationNotificationResult;
  }> => {
    const { EVENT_COLUMNS } = await import("./follow-up-query.server");
    const { notifyEventCancelled } = await import("./notify.server");
    await requireRole(
      context.supabase,
      context.userId,
      FOLLOW_UP_MANAGE_ROLES,
      "cancel calendar events",
    );
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: context.userId,
        cancellation_reason: data.reason,
      })
      .eq("id", data.id)
      .select(EVENT_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That calendar event could not be cancelled.");

    const notification = await notifyEventCancelled(
      context.supabase,
      context.userId,
      row as Parameters<typeof notifyEventCancelled>[2],
      data.reason,
    );
    return { ok: true, notification };
  });

/** Undo a cancellation. The write-up requirement comes back with it. */
export const reinstateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => {
    if (!UUID_RE.test(data?.id ?? "")) throw new Error("An event id is required.");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireRole(
      context.supabase,
      context.userId,
      FOLLOW_UP_MANAGE_ROLES,
      "reinstate calendar events",
    );
    const { error } = await context.supabase
      .from("calendar_events")
      .update({
        status: "scheduled",
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: "",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Record that no write-up is required, and why.
 *
 * The reason is mandatory. Waiving a duty-of-care obligation without one leaves
 * nothing for anyone to review afterwards.
 */
export const waiveEventFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; reason: string }) => {
    if (!UUID_RE.test(data?.id ?? "")) throw new Error("An event id is required.");
    const reason = (data?.reason ?? "").trim();
    if (!reason) throw new Error("Give a reason why no write-up is required.");
    if (reason.length > 500) throw new Error("Reason must be 500 characters or fewer.");
    return { id: data.id, reason };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireRole(context.supabase, context.userId, FOLLOW_UP_MANAGE_ROLES, "waive a follow-up");
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .update({
        follow_up_waived_at: new Date().toISOString(),
        follow_up_waived_by: context.userId,
        follow_up_waiver_reason: data.reason,
      })
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That follow-up could not be waived.");
    return { ok: true };
  });

/**
 * A mentor records that their own write-up is not required, for example a
 * Match they did not attend.
 *
 * Only the mentor the event is assigned to may do this, and only with a
 * reason. Calendar RLS lets managers alone update events, so after this
 * function has checked the assignment through the caller's own client, the
 * one narrow write runs through the privileged client, still bound to the
 * caller's id. Managers keep using `waiveEventFollowUp`, and can reinstate
 * anything a mentor waives here.
 */
export const waiveMyEventFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; reason: string }) => {
    if (!UUID_RE.test(data?.id ?? "")) throw new Error("An event id is required.");
    const reason = (data?.reason ?? "").trim();
    if (!reason) throw new Error("Give a reason why no write-up is required.");
    if (reason.length > 500) throw new Error("Reason must be 500 characters or fewer.");
    return { id: data.id, reason };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireRole(
      context.supabase,
      context.userId,
      FOLLOW_UP_SELF_WAIVE_ROLES,
      "remove your own write-up",
    );
    const { data: event, error: readError } = await context.supabase
      .from("calendar_events")
      .select("id, assigned_mentor_id, status, follow_up_waived_at")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    assertSelfWaivable(event, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("calendar_events")
      .update({
        follow_up_waived_at: new Date().toISOString(),
        follow_up_waived_by: context.userId,
        follow_up_waiver_reason: data.reason,
      })
      .eq("id", data.id)
      // Repeat the checks on the write, so a reassignment or cancellation
      // between the read and this update affects no row.
      .eq("assigned_mentor_id", context.userId)
      .neq("status", "cancelled")
      .is("follow_up_waived_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That write-up could not be removed. Please refresh.");
    return { ok: true };
  });

/** Put a waived requirement back. */
export const reinstateEventFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => {
    if (!UUID_RE.test(data?.id ?? "")) throw new Error("An event id is required.");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireRole(
      context.supabase,
      context.userId,
      FOLLOW_UP_MANAGE_ROLES,
      "reinstate a follow-up",
    );
    const { error } = await context.supabase
      .from("calendar_events")
      .update({
        follow_up_waived_at: null,
        follow_up_waived_by: null,
        follow_up_waiver_reason: "",
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
