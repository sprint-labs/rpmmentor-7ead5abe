/**
 * Commit a confirmed fixture import into `public.calendar_events`.
 *
 * Preview/parsing stays in the browser. This handler re-validates every row,
 * re-checks duplicates against the live table, and inserts through the same
 * people-resolution path as a single “Add event” save. It never creates
 * goalkeeper records and never updates existing events.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CALENDAR_MANAGE_ROLES,
  resolveEventPeople,
  toTeamCalendarEvent,
  validateEvent,
  type TeamCalendarEvent,
} from "@/lib/calendar.functions";
import {
  extractFixtureDuplicateKey,
  findDuplicateEventId,
  indexExistingFixtureKeys,
  type ExistingCalendarEventRef,
  type FixtureImportCommitResult,
} from "@/lib/calendar/fixture-import";
import { requireRole } from "@/lib/roles.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COLUMNS =
  "id, title, event_type, event_date, start_time, end_time, location, notes, player_id, goalkeeper_name, assigned_mentor_id, assigned_mentor_name, status, cancellation_reason, follow_up_waived_at, follow_up_waiver_reason, created_by, created_by_name";

const commitRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(160),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  location: z.string().trim().max(160).nullable(),
  notes: z.string().trim().max(4000),
  player_id: z.string().regex(UUID),
  assigned_mentor_id: z.string().regex(UUID),
  duplicateKey: z.string().trim().min(1).max(500),
});

const commitSchema = z.object({
  confirm: z.literal(true),
  rows: z.array(commitRowSchema).min(1).max(500),
});

function friendlyWriteError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("row-level security") || text.includes("permission")) {
    return "You do not have permission to add calendar events.";
  }
  if (text.includes("foreign key") || text.includes("violates")) {
    return "One of the selected goalkeepers or mentors is no longer available.";
  }
  if (text.includes("duplicate key") || text.includes("unique constraint")) {
    return "That fixture already exists on the calendar.";
  }
  return "That fixture could not be saved. Check the row details and try again.";
}

export const commitFixtureImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => commitSchema.parse(data))
  .handler(async ({ data, context }): Promise<FixtureImportCommitResult> => {
    const { notifyEventAssigned } = await import("@/lib/events/notify.server");
    await requireRole(
      context.supabase,
      context.userId,
      CALENDAR_MANAGE_ROLES,
      "import calendar fixtures",
    );

    if (!data.confirm) {
      throw new Error("Confirm the import before writing fixtures to the calendar.");
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("name")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: existingRows, error: existingError } = await context.supabase
      .from("calendar_events")
      .select("id, player_id, event_date, start_time, title, event_type, notes, location, status")
      .order("event_date", { ascending: false })
      .limit(5000);
    if (existingError) throw new Error(friendlyWriteError(existingError.message));

    const existingIndex = indexExistingFixtureKeys(
      (existingRows ?? []) as ExistingCalendarEventRef[],
    );

    const result: FixtureImportCommitResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      rows: [],
    };

    // Within this batch, skip repeats of the same duplicate key.
    const seenKeys = new Set<string>();

    for (const row of data.rows) {
      try {
        if (seenKeys.has(row.duplicateKey) || existingIndex.has(row.duplicateKey)) {
          const existingId =
            existingIndex.get(row.duplicateKey) ??
            findDuplicateEventId(
              row.duplicateKey,
              row.title,
              row.player_id,
              row.event_date,
              row.start_time,
              existingIndex,
            );
          result.skipped += 1;
          result.rows.push({
            rowNumber: row.rowNumber,
            outcome: "skipped_duplicate",
            eventId: existingId,
            message: "Skipped — this fixture is already on the calendar.",
          });
          continue;
        }

        const notesKey = extractFixtureDuplicateKey(row.notes);
        if (notesKey && notesKey !== row.duplicateKey) {
          throw new Error("Fixture identity marker does not match the confirmed row.");
        }

        const validated = validateEvent({
          title: row.title,
          event_type: "Match",
          event_date: row.event_date,
          start_time: row.start_time,
          location: row.location,
          notes: row.notes,
          player_id: row.player_id,
          assigned_mentor_id: row.assigned_mentor_id,
        });

        const people = await resolveEventPeople(
          context.supabase,
          validated.player_id,
          validated.assigned_mentor_id,
        );

        const { data: inserted, error } = await context.supabase
          .from("calendar_events")
          .insert({
            ...validated,
            ...people,
            end_time: null,
            created_by: context.userId,
            created_by_name: profile?.name ?? "",
          })
          .select(COLUMNS)
          .single();

        if (error) throw new Error(friendlyWriteError(error.message));
        if (!inserted) throw new Error("That fixture could not be saved.");

        const event = toTeamCalendarEvent(inserted as Parameters<typeof toTeamCalendarEvent>[0]);
        await notifyEventAssigned(context.supabase, context.userId, event);

        existingIndex.set(row.duplicateKey, event.id);
        seenKeys.add(row.duplicateKey);
        result.imported += 1;
        result.rows.push({
          rowNumber: row.rowNumber,
          outcome: "imported",
          eventId: event.id,
          message: `Imported as ${event.title}.`,
        });
      } catch (err) {
        result.failed += 1;
        result.rows.push({
          rowNumber: row.rowNumber,
          outcome: "failed",
          eventId: null,
          message: err instanceof Error ? err.message : "That fixture could not be saved.",
        });
      }
    }

    return result;
  });

export type { TeamCalendarEvent };
