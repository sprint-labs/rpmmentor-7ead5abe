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
  end_time: string | null;
  location: string | null;
  notes: string;
  player_id: string | null;
  goalkeeper_name: string | null;
  created_by: string;
  created_by_name: string;
}

const COLUMNS =
  "id, title, event_type, event_date, start_time, end_time, location, notes, player_id, goalkeeper_name, created_by, created_by_name";

interface EventInput {
  title: string;
  event_type: string;
  event_date: string;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  notes?: string | null;
  player_id?: string | null;
  goalkeeper_name?: string | null;
}

function validateEvent(data: EventInput) {
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
  const gkName = (data?.goalkeeper_name ?? "").trim();
  const playerId = (data?.player_id ?? "").trim();
  return {
    title,
    event_type: type,
    event_date: data.event_date,
    start_time: time(data.start_time),
    end_time: time(data.end_time),
    location: location || null,
    notes,
    player_id: playerId || null,
    goalkeeper_name: gkName || null,
  };
}

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
  .inputValidator((data: EventInput) => validateEvent(data))
  .handler(async ({ data, context }): Promise<TeamCalendarEvent> => {
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "add calendar events");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("name")
      .eq("id", context.userId)
      .maybeSingle<{ name: string }>();

    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .insert({ ...data, created_by: context.userId, created_by_name: profile?.name ?? "" })
      .select(COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return row as TeamCalendarEvent;
  });

export const updateCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: EventInput & { id: string }) => {
    if (!data?.id) throw new Error("An event id is required.");
    return { id: data.id, ...validateEvent(data) };
  })
  .handler(async ({ data, context }): Promise<TeamCalendarEvent> => {
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "edit calendar events");
    const { id, ...fields } = data;
    const { data: row, error } = await context.supabase
      .from("calendar_events")
      .update(fields)
      .eq("id", id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That calendar event could not be updated.");
    return row as TeamCalendarEvent;
  });

export const deleteCalendarEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("An event id is required.");
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await requireRole(context.supabase, context.userId, CALENDAR_MANAGE_ROLES, "delete calendar events");
    const { error } = await context.supabase.from("calendar_events").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
