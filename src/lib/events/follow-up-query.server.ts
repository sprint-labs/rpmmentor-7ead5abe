/**
 * Loading events and working out where their write-ups stand.
 *
 * Server-only, and shared by the Follow-ups list and the overdue-alert sync so
 * the two can never disagree about what counts as outstanding.
 */
import { resolveFollowUp, type FollowUp } from "./follow-up";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type QueryClient = { from: (table: string) => any };

// One literal, not a concatenation: supabase-js infers the row type from the
// select string, and joining pieces together erases that inference.
export const EVENT_COLUMNS =
  "id, title, event_type, event_date, start_time, end_time, location, notes, player_id, goalkeeper_name, assigned_mentor_id, assigned_mentor_name, status, cancellation_reason, follow_up_waived_at, follow_up_waived_by, follow_up_waiver_reason";

/**
 * How far back to look. Older events are history: the calendar remains the
 * record of what was scheduled, but they are no longer outstanding work.
 */
export const LOOKBACK_DAYS = 180;
const ROW_LIMIT = 1000;

export interface EventRow {
  id: string;
  title: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  player_id: string | null;
  goalkeeper_name: string | null;
  assigned_mentor_id: string | null;
  assigned_mentor_name: string | null;
  status: string | null;
  cancellation_reason: string | null;
  follow_up_waived_at: string | null;
  follow_up_waived_by: string | null;
  follow_up_waiver_reason: string | null;
}

export interface EventFollowUpRow {
  eventId: string;
  title: string;
  eventType: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  playerId: string | null;
  goalkeeperName: string | null;
  assignedMentorId: string | null;
  assignedMentorName: string;
  cancellationReason: string;
  waiverReason: string;
  followUp: FollowUp;
  /** True when the signed-in user is the mentor expected to write this up. */
  mine: boolean;
}

/**
 * How many event ids to put in one `in` filter.
 *
 * PostgREST filters travel in the query string, and a few hundred UUIDs is
 * already a URL long enough to be rejected by an intermediary. Asking in batches
 * keeps every request comfortably short; a dropped batch would silently report
 * saved write-ups as missing.
 */
const ID_BATCH = 100;

function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Which of these events already have their write-up saved.
 *
 * Two reads rather than one join: the canonical Match Report store is keyed by
 * its own text report id and holds soft-deleted rows, which are excluded here so
 * that withdrawing a report correctly reopens the requirement.
 */
export async function loadCompletions(
  supabase: QueryClient,
  eventIds: readonly string[],
): Promise<Map<string, string>> {
  const completed = new Map<string, string>();
  if (eventIds.length === 0) return completed;

  for (const chunk of batches(eventIds, ID_BATCH)) {
    const [interactions, reports] = await Promise.all([
      supabase.from("interactions").select("id, calendar_event_id").in("calendar_event_id", chunk),
      supabase
        .from("match_reports_cache")
        .select("report_id, calendar_event_id")
        .is("deleted_at", null)
        .in("calendar_event_id", chunk),
    ]);
    if (interactions.error) throw new Error(interactions.error.message);
    if (reports.error) throw new Error(reports.error.message);

    for (const row of interactions.data ?? []) {
      if (row.calendar_event_id) completed.set(row.calendar_event_id, row.id as string);
    }
    for (const row of reports.data ?? []) {
      if (row.calendar_event_id) completed.set(row.calendar_event_id, row.report_id as string);
    }
  }
  return completed;
}

export function toFollowUpRow(
  row: EventRow,
  completedRecordId: string | null,
  userId: string,
  now: number = Date.now(),
): EventFollowUpRow {
  return {
    eventId: row.id,
    title: row.title,
    eventType: row.event_type,
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    playerId: row.player_id,
    goalkeeperName: row.goalkeeper_name,
    assignedMentorId: row.assigned_mentor_id,
    assignedMentorName: row.assigned_mentor_name ?? "",
    cancellationReason: row.cancellation_reason ?? "",
    waiverReason: row.follow_up_waiver_reason ?? "",
    followUp: resolveFollowUp(
      {
        eventType: row.event_type,
        eventDate: row.event_date,
        startTime: row.start_time,
        endTime: row.end_time,
        cancelled: row.status === "cancelled",
        waived: Boolean(row.follow_up_waived_at),
        completedRecordId,
      },
      now,
    ),
    mine: row.assigned_mentor_id === userId,
  };
}

/**
 * Events within the lookback window, with their follow-up resolved.
 *
 * `canSeeEveryone` comes from the caller's roles: a mentor is scoped to their own
 * assignments, management roles see everything. Row Level Security enforces the
 * same boundary independently.
 */
export async function loadEventFollowUps(
  supabase: QueryClient,
  userId: string,
  canSeeEveryone: boolean,
): Promise<EventFollowUpRow[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);

  let query = supabase
    .from("calendar_events")
    .select(EVENT_COLUMNS)
    .gte("event_date", since)
    .order("event_date", { ascending: false })
    .limit(ROW_LIMIT);
  if (!canSeeEveryone) query = query.eq("assigned_mentor_id", userId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as EventRow[];

  const completions = await loadCompletions(
    supabase,
    rows.map((r) => r.id),
  );
  const now = Date.now();
  return rows.map((row) => toFollowUpRow(row, completions.get(row.id) ?? null, userId, now));
}
