/**
 * Pure mapping between `public.calendar_events` rows and the mentor home
 * "Upcoming Interactions and Matches" list.
 *
 * Deliberately free of Supabase and React so the forward window arithmetic,
 * the planned-type mapping, the roster decoration and the date/time display
 * can be unit tested directly.
 *
 * `event_date` is a Postgres `DATE` and `start_time` a nullable `TIME`, so
 * neither is ever round-tripped through `new Date(iso)`: that parses
 * "YYYY-MM-DD" as UTC midnight and shifts the day for anyone west of UTC.
 * See the note at the top of `src/lib/interactions/schema.ts`.
 */
import { toLocalDateOnly } from "@/lib/dashboard-period";
import { normaliseGoalkeeperName } from "@/lib/goalkeeper-filters";
import { dateOnlyToLocalMs } from "@/lib/interactions/schema";
import type { Goalkeeper, TierLevel } from "@/lib/mock-data";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME = /^\d{2}:\d{2}/;

/**
 * Ceiling on the rows read for one dashboard window, so the query stays
 * bounded as the shared calendar grows.
 */
export const UPCOMING_EVENTS_LIMIT = 200;

/** The `public.calendar_events` columns mentor home reads. */
export interface UpcomingCalendarEventRow {
  id: string;
  title: string;
  event_type: string;
  /** Calendar date, "YYYY-MM-DD". */
  event_date: string;
  /** Clock time, "HH:MM[:SS]", or null when the event has no set time. */
  start_time: string | null;
  goalkeeper_name: string | null;
}

/** The roster fields used to decorate a row. Display only. */
export type UpcomingRosterGoalkeeper = Pick<
  Goalkeeper,
  "id" | "name" | "initials" | "status" | "tierLevel" | "club" | "league"
>;

export type UpcomingPlannedType =
  "Coffee Catch Up" | "Attend Live Match" | "Training Ground Visit" | string;

export interface MentorUpcomingInteraction {
  id: string;
  /** Stored calendar date, "YYYY-MM-DD". Never a timestamp. */
  date: string;
  /** Stored start time as "HH:MM", or null when the event has no set time. */
  startTime: string | null;
  title: string;
  type: string;
  plannedType: UpcomingPlannedType | null;
  gkId: string | null;
  gkName: string | null;
  gkInitials: string | null;
  gkStatus: string | null;
  gkTierLevel: TierLevel | null;
  gkClub: string | null;
  gkLeague: string | null;
  gkFreeAgent: boolean;
}

/**
 * Map a calendar event type onto the planned interaction type the dashboard
 * filters on.
 *
 * The first three are the current schedulable types. The rest are retired types
 * that older events still carry, kept here so those events continue to appear
 * under the right filter chip rather than dropping out of the list.
 */
export function mapPlannedType(type: string): UpcomingPlannedType | null {
  switch (type) {
    case "Match":
      return "Attend Live Match";
    case "Training Ground Visit":
      return "Training Ground Visit";
    case "Coffee Catch-up":
      return "Coffee Catch Up";
    case "Observation":
      return "Attend Live Match";
    case "Mentor Visit":
      return "Training Ground Visit";
    case "Meeting":
      return "Coffee Catch Up";
    default:
      return null;
  }
}

/**
 * Shift a stored calendar date by whole days in local calendar terms.
 *
 * Adding `days * 86400000` would drift across a DST change and
 * `new Date(date)` would start from UTC midnight, so both are avoided.
 */
export function addCalendarDays(date: string, days: number): string {
  if (!DATE_ONLY.test(date)) return date;
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return toLocalDateOnly(new Date(year, month - 1, day + days));
}

/**
 * The forward window mentor home shows: the caller's local today through
 * today + `days`, inclusive.
 *
 * `lastNDaysPeriod` only describes a BACKWARD window, so the upper bound is
 * derived here from the caller's local "today" rather than reusing `toDate`.
 */
export function upcomingWindow(today: string, days: number): { fromDate: string; toDate: string } {
  return { fromDate: today, toDate: addCalendarDays(today, days) };
}

/** "HH:MM" from a stored `TIME`, or null when there is no usable time. */
function normaliseStartTime(value: string | null | undefined): string | null {
  const time = value?.trim() ?? "";
  return CLOCK_TIME.test(time) ? time.slice(0, 5) : null;
}

/** Index the roster by normalised name so a row can be decorated in O(1). */
export function buildRosterNameIndex(
  roster: readonly UpcomingRosterGoalkeeper[],
): Map<string, UpcomingRosterGoalkeeper> {
  const index = new Map<string, UpcomingRosterGoalkeeper>();
  for (const gk of roster) {
    const key = normaliseGoalkeeperName(gk.name);
    if (key && !index.has(key)) index.set(key, gk);
  }
  return index;
}

/**
 * Turn one calendar row into a list item.
 *
 * The roster lookup is DISPLAY DECORATION ONLY: it adds the tier badges, club
 * and league a mentor expects to see, and is never used to resolve an identity
 * for a write. An event whose goalkeeper is not on the roster keeps its stored
 * name and simply loses the badges.
 */
export function toUpcomingInteraction(
  row: UpcomingCalendarEventRow,
  rosterByName: ReadonlyMap<string, UpcomingRosterGoalkeeper>,
): MentorUpcomingInteraction {
  const storedName = row.goalkeeper_name?.trim() || null;
  const gk = storedName ? (rosterByName.get(normaliseGoalkeeperName(storedName)) ?? null) : null;
  return {
    id: row.id,
    date: row.event_date,
    startTime: normaliseStartTime(row.start_time),
    title: row.title,
    type: row.event_type,
    plannedType: mapPlannedType(row.event_type),
    // The Log button prefills the dialog from this slug, so it stays null
    // when there is no roster match — the stored name is passed instead.
    gkId: gk?.id ?? null,
    gkName: gk?.name ?? storedName,
    gkInitials: gk?.initials ?? null,
    gkStatus: gk?.status ?? null,
    gkTierLevel: gk?.tierLevel ?? null,
    gkClub: gk?.club ?? null,
    gkLeague: gk?.league ?? null,
    gkFreeAgent: gk?.status === "Free Agent",
  };
}

export function mapUpcomingCalendarEvents(
  rows: readonly UpcomingCalendarEventRow[],
  roster: readonly UpcomingRosterGoalkeeper[],
): MentorUpcomingInteraction[] {
  const rosterByName = buildRosterNameIndex(roster);
  return rows.map((row) => toUpcomingInteraction(row, rosterByName));
}

/**
 * "August 13th · 14:30" from a stored calendar date and start time.
 *
 * The date is built from its own parts so it cannot shift a day, and an event
 * with no start time renders the date alone rather than a misleading "00:00".
 */
export function formatUpcomingEventDateTime(date: string, startTime: string | null): string {
  const localMs = dateOnlyToLocalMs(date);
  if (!Number.isFinite(localMs)) return date;
  const local = new Date(localMs);
  const day = local.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = local.toLocaleString("en-GB", { month: "long" });
  const time = normaliseStartTime(startTime);
  return time ? `${month} ${day}${suffix} · ${time}` : `${month} ${day}${suffix}`;
}

export const UPCOMING_GROUP_ORDER = [
  "Today",
  "Tomorrow",
  "This week",
  "Next week",
  "Later",
] as const;
export type UpcomingGroupLabel = (typeof UPCOMING_GROUP_ORDER)[number];

/** Local midnight on the Monday of the week containing `value`. */
function mondayOfWeek(value: Date): Date {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const dayOfWeek = date.getDay();
  date.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  return date;
}

/** Bucket a stored calendar date relative to the viewer's local today. */
export function upcomingGroupLabel(date: string, now: Date = new Date()): UpcomingGroupLabel {
  const localMs = dateOnlyToLocalMs(date);
  if (!Number.isFinite(localMs)) return "Later";
  const event = new Date(localMs);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Rounded, because a day either side of a DST change is 23 or 25 hours.
  const daysDiff = Math.round((event.getTime() - today.getTime()) / 86400000);
  if (daysDiff === 0) return "Today";
  if (daysDiff === 1) return "Tomorrow";
  const thisWeek = mondayOfWeek(today);
  const eventWeek = mondayOfWeek(event).getTime();
  if (eventWeek === thisWeek.getTime()) return "This week";
  const nextWeek = new Date(
    thisWeek.getFullYear(),
    thisWeek.getMonth(),
    thisWeek.getDate() + 7,
  ).getTime();
  if (eventWeek === nextWeek) return "Next week";
  return "Later";
}
