/**
 * What a mentor is actually told about an event.
 *
 * Kept pure and separate from the write path so the wording is testable and so
 * every notification is guaranteed to carry the six things a mentor needs to act
 * without opening anything else: the event type, the goalkeeper, when it is, what
 * they owe, when it is due, and a link that opens the right form.
 *
 * The rendered text is stored on the row rather than recomputed at read time, so
 * the inbox shows what was sent even after the event has been edited.
 */
import {
  FOLLOW_UP_STATUS_LABEL,
  followUpRequirementLabel,
  resolveFollowUp,
  type FollowUpKind,
} from "./follow-up";
import { formatLondonInstant, londonWallClockMs } from "@/lib/time/london";
import { normalizeMatchParticipationStatus } from "./participation";

export type NotificationKind =
  "event_assigned" | "event_updated" | "event_unassigned" | "event_cancelled" | "follow_up_overdue";

/** The event facts a notification is built from. */
export interface NotifiableEvent {
  id: string;
  title: string;
  eventType: string;
  eventDate: string;
  startTime: string | null;
  endTime?: string | null;
  goalkeeperName: string | null;
  playerId: string | null;
  participationStatus?: string | null;
  status?: string;
}

export interface NotificationCopy {
  kind: NotificationKind;
  title: string;
  body: string;
  linkPath: string;
}

export interface CancellationFeedback {
  level: "success" | "warning";
  message: string;
}

export type CancellationNotificationResult = "delivered" | "not_required" | "failed";

/** Tell the manager exactly what happened after a cancellation attempt. */
export function cancellationFeedback(result: CancellationNotificationResult): CancellationFeedback {
  if (result === "delivered") {
    return {
      level: "success",
      message: "Event cancelled. The assigned mentor has been notified.",
    };
  }
  if (result === "not_required") {
    return { level: "success", message: "Event cancelled." };
  }
  return {
    level: "warning",
    message:
      "Event cancelled, but the mentor notification could not be delivered. Contact them directly.",
  };
}

/** "Fri 14 Aug, 16:00" for a scheduled event, in London time. */
export function formatEventWhen(event: NotifiableEvent): string {
  return formatLondonInstant(londonWallClockMs(event.eventDate, event.startTime));
}

/**
 * Where the mentor goes to discharge the requirement.
 *
 * The event id travels in the URL so the saved record can be linked back to the
 * event that asked for it. A Match Report is prefilled by goalkeeper NAME and a
 * logged interaction by player id, matching what each form already expects.
 */
export function followUpLinkPath(event: NotifiableEvent, kind: FollowUpKind | null): string {
  const params = new URLSearchParams();
  if (kind === "match_report") {
    params.set("openSubmit", "1");
    if (event.goalkeeperName) params.set("gk", event.goalkeeperName);
    params.set("matchDate", event.eventDate);
    params.set("eventId", event.id);
    return `/reports?${params.toString()}`;
  }
  if (kind === "interaction") {
    params.set("openLog", "1");
    if (event.playerId) params.set("gkId", event.playerId);
    params.set("date", event.eventDate);
    params.set("eventId", event.id);
    return `/interactions?${params.toString()}`;
  }
  return "/calendar";
}

function describe(event: NotifiableEvent, kind: FollowUpKind | null, deadlineMs: number): string {
  const gk = event.goalkeeperName || "an unnamed goalkeeper";
  const required = followUpRequirementLabel(kind);
  const lines = [`${event.eventType} with ${gk}`, `Scheduled: ${formatEventWhen(event)} (London)`];
  if (event.eventType === "Match") {
    const participation = normalizeMatchParticipationStatus(event.participationStatus);
    if (participation === "not_confirmed") {
      lines.push(
        "Participation: Not confirmed — a Mentor Manager or administrator needs to confirm who played; no Match Report is due unless this goalkeeper is marked Played",
      );
      return lines.join("\n");
    }
    if (participation === "did_not_play") {
      lines.push("Participation: Did not play — no Match Report is required");
      return lines.join("\n");
    }
  }
  if (kind) {
    lines.push(`You need to submit: ${required}`);
    lines.push(`Due by: ${formatLondonInstant(deadlineMs)} (London)`);
  }
  return lines.join("\n");
}

/**
 * Build the notification for an event change.
 *
 * `reason` is only used for a cancellation, where the mentor should be told why
 * their scheduled work has gone away.
 */
export function buildEventNotification(
  kind: NotificationKind,
  event: NotifiableEvent,
  options: { reason?: string; now?: number } = {},
): NotificationCopy {
  const followUp = resolveFollowUp(
    {
      eventType: event.eventType,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime ?? null,
      cancelled: kind === "event_cancelled",
      waived: false,
      completedRecordId: null,
      participationStatus: event.participationStatus,
    },
    options.now ?? Date.now(),
  );

  const gk = event.goalkeeperName || "an unnamed goalkeeper";
  const when = formatEventWhen(event);
  const detail = describe(event, followUp.kind, followUp.deadlineMs);
  const link =
    event.eventType === "Match" && followUp.participationStatus !== "played"
      ? "/calendar"
      : followUpLinkPath(event, followUp.kind);

  switch (kind) {
    case "event_assigned":
      return {
        kind,
        title: `New ${event.eventType}: ${gk}`,
        body: `You have been assigned to this event.\n${detail}`,
        linkPath: link,
      };
    case "event_updated":
      return {
        kind,
        title: `Changed: ${event.eventType} with ${gk}`,
        body: `The details of this event have changed.\n${detail}`,
        linkPath: link,
      };
    case "event_unassigned":
      return {
        kind,
        title: `No longer yours: ${event.eventType} with ${gk}`,
        body: `This event has been reassigned to another mentor. You are no longer expected to write it up.\n${event.eventType} with ${gk}\nScheduled: ${when} (London)`,
        linkPath: "/calendar",
      };
    case "event_cancelled": {
      const because = options.reason?.trim() ? `\nReason: ${options.reason.trim()}` : "";
      return {
        kind,
        title: `Cancelled: ${event.eventType} with ${gk}`,
        body: `This event has been cancelled and no write-up is required.\nWas scheduled: ${when} (London)${because}`,
        linkPath: "/calendar",
      };
    }
    case "follow_up_overdue":
      return {
        kind,
        title: `${FOLLOW_UP_STATUS_LABEL.overdue}: ${followUpRequirementLabel(followUp.kind)} for ${gk}`,
        body: `The 48-hour window for this write-up has passed. This is an operational duty-of-care reminder, not a safeguarding concern.\n${detail}`,
        linkPath: link,
      };
  }
}
