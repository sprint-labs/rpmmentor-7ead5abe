/**
 * What a scheduled event obliges someone to write up afterwards, and where that
 * obligation currently stands.
 *
 * The status is DERIVED, never stored. A calendar event carries at most one
 * follow-up requirement because the requirement *is* the event: there is no
 * separate requirement row that could be duplicated by a retried save, drift out
 * of step with a reschedule, or be left behind pointing at the previous mentor.
 * Rescheduling, reassigning and changing the type therefore update the single
 * existing requirement by construction rather than by remembering to.
 *
 * Only the facts that cannot be derived are persisted: whether the event was
 * cancelled, whether a manager waived the write-up and why, and the identity of
 * the saved record that satisfied it.
 */
import { addHours, londonWallClockMs } from "@/lib/time/london";

/**
 * The three event types a manager may schedule.
 *
 * Older rows may still hold a retired type (see `LEGACY_EVENT_TYPES`). Those
 * remain readable; they simply cannot be saved again without being reclassified.
 */
export const EVENT_TYPES = ["Match", "Training Ground Visit", "Coffee Catch-up"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Types created before the list above; kept only so historic rows still render. */
export const LEGACY_EVENT_TYPES = [
  "Observation",
  "Mentor Visit",
  "Meeting",
  "Follow Up",
  "Other",
] as const;

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/** Which record closes out an event. */
export type FollowUpKind = "match_report" | "interaction";

/**
 * A Match is answered by a Match Report; the two face-to-face types are answered
 * by an Interaction. A Match Report already creates its own "Live Match
 * Observation" interaction as part of submission, so nothing here asks for a
 * second, synthetic one.
 */
export const FOLLOW_UP_KIND_BY_EVENT_TYPE: Record<EventType, FollowUpKind> = {
  Match: "match_report",
  "Training Ground Visit": "interaction",
  "Coffee Catch-up": "interaction",
};

/**
 * The interaction type that answers each face-to-face event.
 *
 * The event label "Coffee Catch-up" and the stored interaction type
 * "Coffee Catch Up" differ: the interaction type is fixed by a database check
 * constraint on `public.interactions`, so the mapping is explicit here rather
 * than derived from the label.
 */
export const INTERACTION_TYPE_BY_EVENT_TYPE: Partial<Record<EventType, string>> = {
  "Training Ground Visit": "Training Ground Visit",
  "Coffee Catch-up": "Coffee Catch Up",
};

export type FollowUpStatus =
  | "scheduled"
  | "pending"
  | "completed"
  | "overdue"
  | "cancelled"
  | "not_required";

export const FOLLOW_UP_WINDOW_HOURS = 48;

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  scheduled: "Scheduled",
  pending: "Pending",
  completed: "Completed",
  overdue: "Overdue",
  cancelled: "Cancelled",
  not_required: "Not required",
};

/** Statuses that still need someone to act. */
export const OPEN_FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = ["scheduled", "pending", "overdue"];

/** The stored facts a status is computed from. */
export interface FollowUpSource {
  eventType: string;
  /** Calendar date, "YYYY-MM-DD". */
  eventDate: string;
  /** London wall-clock "HH:MM". Null only on rows created before a time was required. */
  startTime: string | null;
  /** Optional London wall-clock end. Falls back to the start when absent. */
  endTime?: string | null;
  cancelled: boolean;
  /** True once a manager has waived the write-up. */
  waived: boolean;
  /** Set when a linked record has been confirmed saved. */
  completedRecordId: string | null;
}

export interface FollowUp {
  /** Null for a legacy event type, which carries no requirement. */
  kind: FollowUpKind | null;
  status: FollowUpStatus;
  /** Instant the event is scheduled to finish. */
  endsAtMs: number;
  /** Instant the write-up is due: 48 hours after the event finishes. */
  deadlineMs: number;
  completedRecordId: string | null;
}

/**
 * Resolve an event's follow-up.
 *
 * Precedence is deliberate:
 *
 *   completed > cancelled > not required > time-based
 *
 * A saved, linked record is a fact about the world, so it outranks everything —
 * cancelling an event after the write-up landed must not erase the evidence that
 * it landed. Below that, a cancelled event is closed whether or not anyone
 * waived it, and a waiver only matters while the requirement is still open.
 *
 * Nothing here treats "the form was opened" as progress. Completion requires a
 * `completedRecordId`, which is only ever supplied by reading a persisted row.
 */
export function resolveFollowUp(source: FollowUpSource, now: number = Date.now()): FollowUp {
  const kind = isEventType(source.eventType)
    ? FOLLOW_UP_KIND_BY_EVENT_TYPE[source.eventType]
    : null;

  const endsAtMs = londonWallClockMs(source.eventDate, source.endTime || source.startTime);
  const deadlineMs = Number.isFinite(endsAtMs)
    ? addHours(endsAtMs, FOLLOW_UP_WINDOW_HOURS)
    : NaN;

  const status = ((): FollowUpStatus => {
    if (source.completedRecordId) return "completed";
    if (source.cancelled) return "cancelled";
    if (source.waived) return "not_required";
    // An unparseable date cannot be judged against the clock. Treat it as still
    // to come rather than inventing an overdue alert from bad data.
    if (!Number.isFinite(endsAtMs)) return "scheduled";
    if (now < endsAtMs) return "scheduled";
    if (now <= deadlineMs) return "pending";
    return "overdue";
  })();

  return { kind, status, endsAtMs, deadlineMs, completedRecordId: source.completedRecordId };
}

/** What the assigned mentor is being asked to produce, in plain words. */
export function followUpRequirementLabel(kind: FollowUpKind | null): string {
  if (kind === "match_report") return "Match Report";
  if (kind === "interaction") return "Interaction";
  return "No write-up required";
}

/**
 * Whether a record of `kind` may close out this event type.
 *
 * Used on the write path so a Match cannot be signed off with an interaction, or
 * a coffee catch-up with a Match Report.
 */
export function acceptsFollowUpKind(eventType: string, kind: FollowUpKind): boolean {
  if (!isEventType(eventType)) return false;
  return FOLLOW_UP_KIND_BY_EVENT_TYPE[eventType] === kind;
}
