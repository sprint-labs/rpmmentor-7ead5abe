/**
 * Shared team calendar server functions.
 *
 * Every signed-in user may read the calendar. Creating, editing and deleting
 * events is limited to mentor_manager, admin and super_admin — checked here by
 * role (never by name or email) and enforced again by RLS on
 * `public.calendar_events`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { requireRole, type AppRole } from "@/lib/roles.server";
import { EVENT_TYPES, isEventType, type EventType } from "@/lib/events/follow-up";

export const CALENDAR_MANAGE_ROLES: readonly AppRole[] = [
  "mentor_manager",
  "admin",
  "super_admin",
];

/**
 * The schedulable event types, defined with the follow-up rules they trigger.
 *
 * Retired types (Observation, Mentor Visit, Meeting, Follow Up, Other) are no
 * longer offered and no longer accepted on save. Events already stored with one
 * remain readable; they simply have to be reclassified before they can be edited.
 */
export const CALENDAR_EVENT_TYPES = EVENT_TYPES;
export type CalendarEventType = EventType;

type CalendarEventRow = Database["public"]["Tables"]["calendar_events"]["Row"];

/** Columns the calendar list and write-backs actually read. */
export type CalendarEventSelect = Pick<
  CalendarEventRow,
  | "id"
  | "title"
  | "event_type"
  | "event_date"
  | "start_time"
  | "end_time"
  | "location"
  | "notes"
  | "player_id"
  | "goalkeeper_name"
  | "assigned_mentor_id"
  | "assigned_mentor_name"
  | "status"
  | "cancellation_reason"
  | "follow_up_waived_at"
  | "follow_up_waiver_reason"
  | "created_by"
  | "created_by_name"
>;

/**
 * Narrow a stored row into the shape the UI consumes.
 *
 * Reads must tolerate retired types (Meeting, Observation, …) and any other
 * free-text value already in the table. One unfamiliar type must not blank the
 * whole calendar. Writes still go through `validateEvent`, which only accepts
 * the three schedulable types.
 */
export function toTeamCalendarEvent(row: CalendarEventSelect): TeamCalendarEvent {
  return {
    id: row.id,
    title: row.title,
    event_type: row.event_type,
    event_date: row.event_date,
    start_time: row.start_time,
    end_time: row.end_time,
    location: row.location,
    notes: row.notes,
    player_id: row.player_id,
    goalkeeper_name: row.goalkeeper_name,
    assigned_mentor_id: row.assigned_mentor_id,
    assigned_mentor_name: row.assigned_mentor_name,
    status: row.status,
    cancellation_reason: row.cancellation_reason,
    follow_up_waived_at: row.follow_up_waived_at,
    follow_up_waiver_reason: row.follow_up_waiver_reason,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
  };
}

export interface TeamCalendarEvent {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string;
  player_id: string | null;
  goalkeeper_name: string | null;
  assigned_mentor_id: string | null;
  assigned_mentor_name: string;
  status: string;
  cancellation_reason: string;
  follow_up_waived_at: string | null;
  follow_up_waiver_reason: string;
  created_by: string;
  created_by_name: string;
}

// One literal, not a concatenation: supabase-js infers the row type from the
// select string, and joining pieces together erases that inference.
const COLUMNS =
  "id, title, event_type, event_date, start_time, end_time, location, notes, player_id, goalkeeper_name, assigned_mentor_id, assigned_mentor_name, status, cancellation_reason, follow_up_waived_at, follow_up_waiver_reason, created_by, created_by_name";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EventInput {
  title: string;
  event_type: string;
  event_date: string;
  start_time?: string | null;
  location?: string | null;
  notes?: string | null;
  player_id?: string | null;
  assigned_mentor_id?: string | null;
}

/**
 * Shape and required-field checks.
 *
 * Every event must name a goalkeeper, an attending mentor, a date, a time and a
 * type. The time is required because the 48-hour write-up deadline is measured
 * from it: without one there is no defensible moment to count from.
 *
 * The goalkeeper and the mentor are submitted as ids and confirmed against the
 * database in the handler, so a scheduled event always points at a real roster
 * player and a real profile rather than at a name that happened to match.
 */
export function validateEvent(data: EventInput) {
  const title = (data?.title ?? "").trim();
  if (!title) throw new Error("A title is required.");
  if (title.length > 160) throw new Error("Title must be 160 characters or fewer.");
  const type = (data?.event_type ?? "").trim();
  if (!isEventType(type)) {
    throw new Error("Choose Match, Training Ground Visit or Coffee Catch-up.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.event_date ?? "")) throw new Error("A valid date is required.");
  const time = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    if (!s) throw new Error("A start time is required so the follow-up deadline can be set.");
    if (!/^\d{2}:\d{2}$/.test(s)) throw new Error("Times must be in HH:MM format.");
    return s;
  };
  const notes = (data?.notes ?? "").trim();
  if (notes.length > 4000) throw new Error("Notes must be 4000 characters or fewer.");
  const location = (data?.location ?? "").trim();
  if (location.length > 160) throw new Error("Location must be 160 characters or fewer.");
  const playerId = (data?.player_id ?? "").trim();
  if (!playerId) throw new Error("Choose the goalkeeper this event is about.");
  if (!UUID_RE.test(playerId)) throw new Error("Choose the goalkeeper from the roster list.");
  const mentorId = (data?.assigned_mentor_id ?? "").trim();
  if (!mentorId) throw new Error("Choose the mentor attending this event.");
  if (!UUID_RE.test(mentorId)) throw new Error("Choose the attending mentor from the list.");
  return {
    title,
    event_type: type,
    event_date: data.event_date,
    start_time: time(data.start_time),
    location: location || null,
    notes,
    player_id: playerId,
    assigned_mentor_id: mentorId,
  };
}

type AuthedClient = Parameters<typeof requireRole>[0];

/**
 * Confirms both links exist and derives their display names server-side, so a
 * stored name can never disagree with the id it is meant to describe.
 */
export async function resolveEventPeople(
  supabase: AuthedClient,
  playerId: string,
  mentorId: string,
): Promise<{ goalkeeper_name: string; assigned_mentor_name: string }> {
  const [playerResult, mentorResult] = await Promise.all([
    supabase
      .from("players")
      .select("full_name")
      .eq("id", playerId)
      .maybeSingle(),
    supabase.rpc("list_mentor_directory"),
  ]);
  if (playerResult.error) throw new Error(playerResult.error.message);
  if (mentorResult.error) throw new Error(mentorResult.error.message);
  const player = playerResult.data;
  const mentor = (mentorResult.data ?? []).find(({ id }) => id === mentorId);
  if (!player) throw new Error("That goalkeeper is not on the roster.");
  if (!mentor) throw new Error("That account is not currently an assignable mentor.");
  return {
    goalkeeper_name: player.full_name,
    assigned_mentor_name: mentor.name ?? "",
  };
}

export interface AssignableMentor {
  id: string;
  name: string;
  /** True for a mentor manager, who may be assigned events as well as set them. */
  isManager: boolean;
}

/**
 * Who an event may be assigned to: everyone holding the `mentor` or
 * `mentor_manager` role, identified by account id.
 *
 * The list comes from `public.list_mentor_directory()`. `user_roles` is
 * read-own-only under RLS, so a client cannot filter profiles by role directly;
 * that function answers this one question under SECURITY DEFINER and returns
 * nothing else about the account.
 *
 * Deriving the list from roles rather than from a hard-coded set of names means
 * adding or removing a mentor is a role change, with no code release.
 */
export const listAssignableMentors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssignableMentor[]> => {
    await requireRole(
      context.supabase,
      context.userId,
      CALENDAR_MANAGE_ROLES,
      "assign calendar events",
    );
    const { data, error } = await context.supabase.rpc("list_mentor_directory");
    if (error) throw new Error(error.message);
    return (data ?? []).map((mentor) => ({
      id: mentor.id,
      name: mentor.name ?? "",
      isManager: Boolean(mentor.is_manager),
    }));
  });

export const listCalendarEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeamCalendarEvent[]> => {
    const { data, error } = await context.supabase
      .from("calendar_events")
      .select(COLUMNS)
      .order("event_date", { ascending: true })
      .order("start_time", { ascending: true, nullsFirst: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toTeamCalendarEvent);
  });

export const createCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: EventInput) => validateEvent(data))
  .handler(async ({ data, context }): Promise<TeamCalendarEvent> => {
    const { notifyEventAssigned } = await import("@/lib/events/notify.server");
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "add calendar events");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("name")
      .eq("id", context.userId)
      .maybeSingle();

    const people = await resolveEventPeople(
      context.supabase,
      data.player_id,
      data.assigned_mentor_id,
    );

    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .insert({
        ...data,
        ...people,
        end_time: null,
        created_by: context.userId,
        created_by_name: profile?.name ?? "",
      })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That calendar event could not be created.");

    // The event is saved and confirmed before anyone is told about it, and a
    // failed notification never undoes a legitimate schedule.
    await notifyEventAssigned(context.supabase, context.userId, toTeamCalendarEvent(row));
    return toTeamCalendarEvent(row);
  });

export const updateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: EventInput & { id: string }) => {
    if (!data?.id) throw new Error("An event id is required.");
    return { id: data.id, ...validateEvent(data) };
  })
  .handler(async ({ data, context }): Promise<TeamCalendarEvent> => {
    const { notifyEventChanged } = await import("@/lib/events/notify.server");
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "edit calendar events");
    const { id, ...fields } = data;
    const people = await resolveEventPeople(
      context.supabase,
      fields.player_id,
      fields.assigned_mentor_id,
    );

    // Read the previous values first, so the change can be described to whoever
    // it affects — including a mentor the event has just been taken away from.
    const { data: before } = await context.supabase
      .from("calendar_events")
      .select("assigned_mentor_id, event_date, start_time, end_time, player_id, event_type")
      .eq("id", id)
      .maybeSingle();

    const { data: row, error } = await context.supabase
      .from("calendar_events")
      // `end_time` is cleared rather than left behind: the form no longer
      // collects one, so a stored value would be invisible and unmaintainable.
      .update({ ...fields, ...people, end_time: null })
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That calendar event could not be updated.");

    if (before) {
      await notifyEventChanged(
        context.supabase,
        context.userId,
        toTeamCalendarEvent(row),
        before,
      );
    }
    return toTeamCalendarEvent(row);
  });

export const deleteCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => {
    if (!data?.id) throw new Error("An event id is required.");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "delete calendar events");
    const { error } = await context.supabase.from("calendar_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
