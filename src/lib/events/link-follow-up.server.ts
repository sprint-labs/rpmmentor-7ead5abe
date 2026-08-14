/**
 * Confirming that a record may close out a scheduled event.
 *
 * Called before a Match Report or an Interaction is written, so a saved record
 * can only ever be linked to an event that genuinely asked for it, by someone
 * entitled to answer for it. If any of this fails the save is refused outright
 * rather than stored unlinked: silently dropping the link would leave the mentor
 * believing they had discharged a duty-of-care obligation that still stands.
 */
import { acceptsFollowUpKind, type FollowUpKind } from "./follow-up";
import { hasAnyRole, getUserRoles, type AppRole } from "@/lib/roles.server";

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
    .select("id, event_type, event_date, status, player_id, goalkeeper_name, assigned_mentor_id")
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

  return {
    eventId: event.id,
    playerId: event.player_id ?? null,
    goalkeeperName: event.goalkeeper_name ?? null,
    eventDate: String(event.event_date).slice(0, 10),
  };
}

/** True when a failed write was a second attempt to close out the same event. */
export function isDuplicateFollowUp(error: { code?: string } | null | undefined): boolean {
  return error?.code === DUPLICATE_FOLLOW_UP;
}

export const DUPLICATE_FOLLOW_UP_MESSAGE =
  "That event has already been written up. Open the existing record to correct it.";
