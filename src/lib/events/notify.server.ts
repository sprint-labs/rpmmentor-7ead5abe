/**
 * Writing notifications when a scheduled event changes.
 *
 * These are plain helpers rather than server functions: they are called from
 * inside the calendar handlers, using the same authenticated client and therefore
 * the same Row Level Security, so a manager can write to a mentor's inbox and a
 * mentor can write to their own and nobody can write to anyone else's.
 *
 * A notification is a message ABOUT the truth, not the truth itself. If writing
 * one fails, the scheduling change it describes still stands: the caller is told
 * the notification did not go out rather than having a legitimate save rejected.
 */
import {
  buildEventNotification,
  type CancellationNotificationResult,
  type FollowUpNotificationBasis,
  type NotifiableEvent,
  type NotificationKind,
} from "./notification-copy";
import { normalizeMatchParticipationStatus } from "./participation";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type NotifyClient = { from: (table: string) => any };

/** The event fields a notification needs. */
export interface NotifiableEventRow {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time?: string | null;
  goalkeeper_name: string | null;
  player_id: string | null;
  participation_status?: string | null;
  assigned_mentor_id: string | null;
}

function toNotifiable(row: NotifiableEventRow): NotifiableEvent {
  return {
    id: row.id,
    title: row.title,
    eventType: row.event_type,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time ?? null,
    goalkeeperName: row.goalkeeper_name,
    playerId: row.player_id,
    participationStatus: row.participation_status,
  };
}

/**
 * Insert one notification.
 *
 * `ignoreDuplicates` exists for the overdue alert, which is protected by a
 * partial unique index: a repeat is a no-op rather than an error, so the same
 * deadline can be noticed on every page load without stacking up messages.
 */
async function insert(
  supabase: NotifyClient,
  recipientId: string,
  actorId: string,
  eventId: string,
  kind: NotificationKind,
  copy: { title: string; body: string; linkPath: string },
  options: {
    ignoreDuplicates?: boolean;
    followUpBasis?: FollowUpNotificationBasis | null;
  } = {},
): Promise<boolean> {
  const { error } = await supabase.from("notifications").insert({
    recipient_id: recipientId,
    calendar_event_id: eventId,
    kind,
    title: copy.title,
    body: copy.body,
    link_path: copy.linkPath,
    created_by: actorId,
    follow_up_basis: options.followUpBasis ?? null,
  });
  if (!error) return true;
  // 23505 is a unique violation: the alert is already in their inbox.
  if (options.ignoreDuplicates && error.code === "23505") return true;
  return false;
}

/** Tell a mentor an event is now theirs. */
export async function notifyEventAssigned(
  supabase: NotifyClient,
  actorId: string,
  row: NotifiableEventRow,
  completedRecordId: string | null = null,
): Promise<boolean> {
  if (!row.assigned_mentor_id) return true;
  // A manager scheduling their own attendance does not need telling.
  if (row.assigned_mentor_id === actorId) return true;
  const copy = buildEventNotification("event_assigned", toNotifiable(row), { completedRecordId });
  return insert(supabase, row.assigned_mentor_id, actorId, row.id, "event_assigned", copy);
}

/**
 * Tell whoever is affected that an event changed.
 *
 * Reassignment notifies both mentors: the one picking the work up and the one
 * putting it down. A change of date, time or goalkeeper notifies the current
 * mentor, because it moves their deadline or changes who they are watching.
 * Editing only a title, location or note notifies nobody — that is not news.
 */
export async function notifyEventChanged(
  supabase: NotifyClient,
  actorId: string,
  row: NotifiableEventRow,
  previous: {
    assigned_mentor_id: string | null;
    event_date: string;
    start_time: string | null;
    end_time?: string | null;
    player_id: string | null;
    event_type: string;
    participation_status?: string | null;
  },
): Promise<boolean> {
  const results: boolean[] = [];
  const reassigned = row.assigned_mentor_id !== previous.assigned_mentor_id;
  const scheduleMoved =
    row.event_date !== previous.event_date ||
    row.start_time !== previous.start_time ||
    (row.end_time ?? null) !== (previous.end_time ?? null);
  const goalkeeperChanged = row.player_id !== previous.player_id;
  const typeChanged = row.event_type !== previous.event_type;
  const participationChanged =
    (row.participation_status ?? "not_confirmed") !==
    (previous.participation_status ?? "not_confirmed");

  if (
    !reassigned &&
    !scheduleMoved &&
    !goalkeeperChanged &&
    !typeChanged &&
    !participationChanged
  ) {
    return true;
  }

  let completedRecordId: string | null = null;
  if (row.event_type === "Match") {
    // Participation can be confirmed after a historic report is already
    // linked. Read the active completion before composing the notification so
    // the mentor is never asked to submit the same Match Report again.
    const { data: report, error: reportError } = await supabase
      .from("match_reports_cache")
      .select("report_id")
      .eq("calendar_event_id", row.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (reportError) return false;
    completedRecordId = (report?.report_id as string | null | undefined) ?? null;
  }

  if (reassigned) {
    if (previous.assigned_mentor_id && previous.assigned_mentor_id !== actorId) {
      const copy = buildEventNotification("event_unassigned", toNotifiable(row));
      results.push(
        await insert(
          supabase,
          previous.assigned_mentor_id,
          actorId,
          row.id,
          "event_unassigned",
          copy,
        ),
      );
    }
    results.push(await notifyEventAssigned(supabase, actorId, row, completedRecordId));
    return results.every(Boolean);
  }

  if (!row.assigned_mentor_id || row.assigned_mentor_id === actorId) return true;

  const copy = buildEventNotification("event_updated", toNotifiable(row), {
    completedRecordId,
  });
  return insert(supabase, row.assigned_mentor_id, actorId, row.id, "event_updated", copy);
}

/** Tell a mentor their event is off and nothing is owed. */
export async function notifyEventCancelled(
  supabase: NotifyClient,
  actorId: string,
  row: NotifiableEventRow,
  reason: string,
): Promise<CancellationNotificationResult> {
  if (!row.assigned_mentor_id || row.assigned_mentor_id === actorId) return "not_required";
  const copy = buildEventNotification("event_cancelled", toNotifiable(row), { reason });
  return (await insert(supabase, row.assigned_mentor_id, actorId, row.id, "event_cancelled", copy))
    ? "delivered"
    : "failed";
}

/**
 * Record an overdue write-up in the mentor's inbox.
 *
 * Called when a passed deadline is noticed while loading the app rather than by a
 * scheduled job — this project has no cron, and inventing one would mean new
 * infrastructure. The unique index makes repeat calls harmless, so noticing the
 * same overdue item on every page load produces exactly one alert. Managers do
 * not depend on this: they see overdue work computed live on the Follow-ups page
 * whether or not an alert was ever written.
 */
export async function notifyFollowUpOverdue(
  supabase: NotifyClient,
  actorId: string,
  row: NotifiableEventRow,
): Promise<boolean> {
  if (!row.assigned_mentor_id) return true;
  const followUpBasis: FollowUpNotificationBasis | null =
    row.event_type === "Match"
      ? normalizeMatchParticipationStatus(row.participation_status) === "played"
        ? "match_played"
        : null
      : row.event_type === "Training Ground Visit" || row.event_type === "Coffee Catch-up"
        ? "interaction"
        : null;
  // A direct or stale caller must not create an unverified Match reminder.
  if (!followUpBasis) return false;
  const copy = buildEventNotification("follow_up_overdue", toNotifiable(row));
  return insert(supabase, row.assigned_mentor_id, actorId, row.id, "follow_up_overdue", copy, {
    ignoreDuplicates: true,
    followUpBasis,
  });
}
