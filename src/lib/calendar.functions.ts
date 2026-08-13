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
import { requireRole, type AppRole } from "@/lib/roles.server";

export const CALENDAR_MANAGE_ROLES: readonly AppRole[] = [
  "mentor_manager",
  "admin",
  "super_admin",
];

export const CALENDAR_EVENT_TYPES = [
  "Match",
  "Observation",
  "Mentor Visit",
  "Meeting",
  "Follow Up",
  "Other",
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export interface TeamCalendarEvent {
  id: string;
  title: string;
  event_type: CalendarEventType;
  event_date: string;
  start_time: string | null;
  location: string | null;
  notes: string;
  player_id: string | null;
  goalkeeper_name: string | null;
  assigned_mentor_id: string | null;
  assigned_mentor_name: string;
  created_by: string;
  created_by_name: string;
}

const COLUMNS =
  "id, title, event_type, event_date, start_time, location, notes, player_id, goalkeeper_name, assigned_mentor_id, assigned_mentor_name, created_by, created_by_name";

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
 * Shape and required-field checks. The goalkeeper and the attending mentor are
 * submitted as ids and confirmed against the database in the handler, so a
 * scheduled event always points at a real roster player and a real profile.
 */
export function validateEvent(data: EventInput) {
  const title = (data?.title ?? "").trim();
  if (!title) throw new Error("A title is required.");
  if (title.length > 160) throw new Error("Title must be 160 characters or fewer.");
  const type = (data?.event_type ?? "Other") as CalendarEventType;
  if (!CALENDAR_EVENT_TYPES.includes(type)) throw new Error("Unknown event type.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data?.event_date ?? "")) throw new Error("A valid date is required.");
  const time = (v: string | null | undefined) => {
    const s = (v ?? "").trim();
    if (!s) return null;
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
async function resolveEventPeople(
  supabase: AuthedClient,
  playerId: string,
  mentorId: string,
): Promise<{ goalkeeper_name: string; assigned_mentor_name: string }> {
  const [{ data: player }, { data: mentor }] = await Promise.all([
    supabase
      .from("players")
      .select("full_name")
      .eq("id", playerId)
      .maybeSingle<{ full_name: string }>(),
    supabase
      .from("profiles")
      .select("name")
      .eq("id", mentorId)
      .maybeSingle<{ name: string | null }>(),
  ]);
  if (!player) throw new Error("That goalkeeper is not on the roster.");
  if (!mentor) throw new Error("That mentor could not be found.");
  return {
    goalkeeper_name: player.full_name,
    assigned_mentor_name: mentor.name ?? "",
  };
}

/**
 * Profiles a manager can assign an event to. Deliberately not filtered by role:
 * `user_roles` is read-own-only under RLS, so roles cannot be read here, and
 * excluding people by guesswork would hide legitimate attendees — a mentor
 * manager who attends events himself, for one.
 */
export const listAssignableMentors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ id: string; name: string }[]> => {
    await requireRole(
      context.supabase,
      context.userId,
      CALENDAR_MANAGE_ROLES,
      "assign calendar events",
    );
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, name")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((p) => ({ id: p.id as string, name: (p.name as string | null) ?? "" }));
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
    return (data ?? []) as TeamCalendarEvent[];
  });

export const createCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: EventInput) => validateEvent(data))
  .handler(async ({ data, context }): Promise<TeamCalendarEvent> => {
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "add calendar events");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("name")
      .eq("id", context.userId)
      .maybeSingle<{ name: string }>();

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
    return row as TeamCalendarEvent;
  });

export const updateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: EventInput & { id: string }) => {
    if (!data?.id) throw new Error("An event id is required.");
    return { id: data.id, ...validateEvent(data) };
  })
  .handler(async ({ data, context }): Promise<TeamCalendarEvent> => {
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "edit calendar events");
    const { id, ...fields } = data;
    const people = await resolveEventPeople(
      context.supabase,
      fields.player_id,
      fields.assigned_mentor_id,
    );
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
    return row as TeamCalendarEvent;
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
