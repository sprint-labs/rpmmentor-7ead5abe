import type { LoggedInteraction } from "@/lib/interactions/schema";

export interface InteractionDbRow {
  id: string;
  gk_slug: string | null;
  goalkeeper_name: string;
  player_id: string | null;
  mentor_id: string;
  mentor_name: string | null;
  interaction_type: string;
  club: string | null;
  occurred_at: string;
  notes: string | null;
  outcome: string | null;
  follow_up: string | null;
  created_at: string;
  match_report_id?: string | null;
  calendar_event_id?: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
}

/**
 * Every column the client shape needs, in one place so the create, update,
 * list and paged-list queries can never drift apart.
 */
export const INTERACTION_COLUMNS =
  "id, gk_slug, goalkeeper_name, player_id, mentor_id, mentor_name, interaction_type, club, occurred_at, notes, outcome, follow_up, created_at, match_report_id, calendar_event_id, updated_at, updated_by";

/**
 * Map a database row to the client shape. `occurred_at` is a Postgres `date`
 * and is passed through as the raw "YYYY-MM-DD" string — never parsed into a
 * Date here, so no timezone can shift the day.
 */
export function mapInteractionRow(row: InteractionDbRow): LoggedInteraction {
  return {
    id: row.id,
    gkSlug: row.gk_slug ?? "",
    goalkeeperName: row.goalkeeper_name,
    playerId: row.player_id,
    mentorId: row.mentor_id,
    mentorName: row.mentor_name ?? "",
    interactionType: row.interaction_type,
    club: row.club ?? "",
    occurredAt: String(row.occurred_at).slice(0, 10),
    notes: row.notes ?? "",
    outcome: row.outcome ?? "",
    followUp: row.follow_up ?? "",
    createdAt: row.created_at,
    matchReportId: row.match_report_id ?? null,
    calendarEventId: row.calendar_event_id ?? null,
    updatedAt: row.updated_at ?? null,
    updatedBy: row.updated_by ?? null,
  };
}

/**
 * Replace an optimistic placeholder with the server-confirmed row.
 *
 * The server row is authoritative for id, timestamps and every persisted
 * field (mentor identity, player link, normalised outcome/follow-up). Any
 * field the server returned empty falls back to the optimistic value so the
 * timeline never regresses to blanks while a refetch is in flight.
 * The result is de-duplicated by id and re-sorted the same way
 * `listInteractions` orders rows: occurredAt desc, then createdAt desc.
 */
export function reconcileInteraction(
  list: LoggedInteraction[] | undefined,
  optimisticId: string,
  saved: LoggedInteraction,
): LoggedInteraction[] {
  const current = list ?? [];
  const optimistic = current.find((i) => i.id === optimisticId);
  const merged: LoggedInteraction = {
    ...saved,
    gkSlug: saved.gkSlug || optimistic?.gkSlug || "",
    goalkeeperName: saved.goalkeeperName || optimistic?.goalkeeperName || "",
    club: saved.club || optimistic?.club || "",
    notes: saved.notes || optimistic?.notes || "",
    outcome: saved.outcome || optimistic?.outcome || "",
    followUp: saved.followUp || optimistic?.followUp || "",
    occurredAt: saved.occurredAt || optimistic?.occurredAt || "",
    createdAt: saved.createdAt || optimistic?.createdAt || new Date().toISOString(),
  };

  const next = current.filter((i) => i.id !== optimisticId && i.id !== merged.id);
  next.unshift(merged);
  return next.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return 0;
  });
}
