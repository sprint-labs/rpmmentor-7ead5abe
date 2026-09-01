/**
 * Confirming that a record may close out a scheduled event.
 *
 * Called before a Match Report or an Interaction is written, so a saved record
 * can only ever be linked to an event that genuinely asked for it, by someone
 * entitled to answer for it. If any of this fails the save is refused outright
 * rather than stored unlinked: silently dropping the link would leave the mentor
 * believing they had discharged a duty-of-care obligation that still stands.
 */
import {
  acceptsFollowUpKind,
  INTERACTION_TYPE_BY_EVENT_TYPE,
  isEventType,
  type FollowUpKind,
} from "./follow-up";
import { hasAnyRole, getUserRoles, type AppRole } from "@/lib/roles.server";
import type { InteractionTypeValue } from "@/lib/interactions/schema";
import { normalizeMatchParticipationStatus } from "./participation";

/* eslint-disable @typescript-eslint/no-explicit-any */
type LinkClient = { from: (table: string) => any };

/** Roles that may write up somebody else's event. */
const WRITE_UP_ANY_ROLES: readonly AppRole[] = ["mentor_manager", "admin", "super_admin"];

/** Postgres unique violation: this event already has its write-up. */
export const DUPLICATE_FOLLOW_UP = "23505";

export interface VerifiedEventLink {
  eventId: string;
  playerId: string | null;
  goalkeeperName: string | null;
  eventDate: string;
  assignedMentorId: string | null;
  /** Existing active report, when this event was already written up. */
  existingReportId: string | null;
  /** The stored interaction type required by this event, when applicable. */
  interactionType: InteractionTypeValue | null;
}

/**
 * Refuse an editable/restored report draft that no longer describes its event.
 *
 * A linked report has an immutable canonical player on `calendar_events`. The
 * report schema still stores the historic display name, so both the canonical
 * id's presence and that display name are checked before the first write. The
 * returned event player id is then used for the derived Live Match Observation.
 */
export function assertMatchReportMatchesEvent(
  target: VerifiedEventLink,
  report: { goalkeeperName: string; matchDate: string },
): void {
  if (!target.playerId || !target.goalkeeperName?.trim()) {
    throw new Error(
      "That Match event has no canonical goalkeeper. Update the event before submitting its Match Report.",
    );
  }

  const normalizeName = (value: string) =>
    value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
  if (normalizeName(report.goalkeeperName) !== normalizeName(target.goalkeeperName)) {
    throw new Error(
      `This Match Report is for ${report.goalkeeperName.trim()}, but the event is for ${target.goalkeeperName}. Set the Goalkeeper back to ${target.goalkeeperName} before submitting this event.`,
    );
  }
  if (report.matchDate !== target.eventDate) {
    throw new Error(
      `This Match Report is dated ${report.matchDate}, but the event is dated ${target.eventDate}. Set Match Date back to ${target.eventDate} before submitting this event.`,
    );
  }
}

/**
 * Check an event can be written up now, by this person, with this kind of record.
 *
 * The goalkeeper is returned from the EVENT rather than trusted from the form, so
 * a linked write-up is always about the goalkeeper the event was scheduled for.
 */
export async function verifyFollowUpTarget(
  supabase: LinkClient,
  userId: string,
  eventId: string,
  kind: FollowUpKind,
): Promise<VerifiedEventLink> {
  const { data: event, error } = await supabase
    .from("calendar_events")
    .select(
      "id, event_type, event_date, status, participation_status, player_id, goalkeeper_name, assigned_mentor_id",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!event) throw new Error("That scheduled event no longer exists.");

  if (event.status === "cancelled") {
    throw new Error("That event was cancelled, so it does not need writing up.");
  }
  if (!acceptsFollowUpKind(event.event_type, kind)) {
    throw new Error(
      kind === "match_report"
        ? `A ${event.event_type} is written up with an interaction, not a Match Report.`
        : `A ${event.event_type} is written up with a Match Report, not an interaction.`,
    );
  }

  if (event.assigned_mentor_id !== userId) {
    const roles = await getUserRoles(supabase as never, userId);
    if (!hasAnyRole(roles, WRITE_UP_ANY_ROLES)) {
      throw new Error("That event is assigned to another mentor.");
    }
  }

  let existingReportId: string | null = null;
  if (kind === "match_report") {
    const participation = normalizeMatchParticipationStatus(event.participation_status);
    // A saved report is historical evidence and must remain retryable/readable
    // after the migration defaults its event to Not confirmed. This also keeps
    // an interrupted idempotent submission able to self-heal its derived Live
    // Match Observation. The unique event/report link still prevents a second
    // report from being created.
    const { data: report, error: reportError } = await supabase
      .from("match_reports_cache")
      .select("report_id")
      .eq("calendar_event_id", eventId)
      .is("deleted_at", null)
      .maybeSingle();
    if (reportError) throw new Error(reportError.message);
    existingReportId = (report?.report_id as string | null | undefined) ?? null;
    if (participation === "not_confirmed" && !existingReportId) {
      throw new Error(
        "Confirm that this goalkeeper Played before submitting a linked Match Report.",
      );
    }
    if (participation === "did_not_play" && !existingReportId) {
      throw new Error("This goalkeeper was marked Did not play, so no Match Report is required.");
    }
  }

  const eventType = String(event.event_type);
  return {
    eventId: event.id,
    playerId: event.player_id ?? null,
    goalkeeperName: event.goalkeeper_name ?? null,
    eventDate: String(event.event_date).slice(0, 10),
    assignedMentorId: event.assigned_mentor_id ?? null,
    existingReportId,
    interactionType: isEventType(eventType)
      ? (INTERACTION_TYPE_BY_EVENT_TYPE[eventType] ?? null)
      : null,
  };
}

/** True when a failed write was a second attempt to close out the same event. */
export function isDuplicateFollowUp(error: { code?: string } | null | undefined): boolean {
  return error?.code === DUPLICATE_FOLLOW_UP;
}

export const DUPLICATE_FOLLOW_UP_MESSAGE =
  "That event has already been written up. Open the existing record to correct it.";
