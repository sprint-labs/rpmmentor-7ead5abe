/**
 * How a follow-up status looks, in one place.
 *
 * The calendar, the mentor home page and the Follow-ups list all show the same
 * six statuses, so they share this rather than each inventing their own colours
 * and wording.
 */
import { Link } from "@tanstack/react-router";
import {
  FOLLOW_UP_STATUS_LABEL,
  followUpRequirementLabel,
  type FollowUp,
  type FollowUpStatus,
} from "@/lib/events/follow-up";
import { describeDeadlineDistance, formatLondonInstant } from "@/lib/time/london";
import { followUpLinkPath, type NotifiableEvent } from "@/lib/events/notification-copy";

const STATUS_CHIP: Record<FollowUpStatus, string> = {
  scheduled: "border-border bg-muted text-muted-foreground",
  pending: "border-warning/30 bg-warning/10 text-warning",
  completed: "border-success/30 bg-success/10 text-success",
  overdue: "border-destructive/40 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground line-through",
  not_required: "border-border bg-muted text-muted-foreground",
};

export function FollowUpStatusPill({
  status,
  className = "",
}: {
  status: FollowUpStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_CHIP[status]} ${className}`}
    >
      {FOLLOW_UP_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The one-line explanation that sits under a status: what is owed and by when,
 * or why nothing is.
 */
export function followUpDetail(
  followUp: FollowUp,
  waiverReason: string,
  cancellationReason: string,
): string {
  const required = followUpRequirementLabel(followUp.kind);
  switch (followUp.status) {
    case "scheduled":
      return `${required} due ${formatLondonInstant(followUp.deadlineMs)}`;
    case "pending":
      return `${required} due ${formatLondonInstant(followUp.deadlineMs)} · ${describeDeadlineDistance(followUp.deadlineMs)}`;
    case "overdue":
      return `${required} was due ${formatLondonInstant(followUp.deadlineMs)} · ${describeDeadlineDistance(followUp.deadlineMs)}`;
    case "completed":
      return `${required} saved and linked to this event`;
    case "cancelled":
      return cancellationReason ? `Event cancelled — ${cancellationReason}` : "Event cancelled";
    case "not_required":
      return waiverReason ? `Waived — ${waiverReason}` : "Waived by a manager";
  }
}

/** A link straight to the form that discharges the requirement. */
export function FollowUpActionLink({
  event,
  followUp,
  label,
}: {
  event: NotifiableEvent;
  followUp: FollowUp;
  label?: string;
}) {
  if (!followUp.kind) return null;
  if (
    followUp.status === "completed" ||
    followUp.status === "cancelled" ||
    followUp.status === "not_required"
  ) {
    return null;
  }
  const path = followUpLinkPath(event, followUp.kind);
  const [to, query] = path.split("?");
  const search = Object.fromEntries(new URLSearchParams(query ?? ""));
  return (
    <Link to={to} search={search} className="text-xs font-medium text-primary hover:underline">
      {label ?? `Submit ${followUpRequirementLabel(followUp.kind)}`}
    </Link>
  );
}
