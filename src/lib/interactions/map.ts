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
}

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
