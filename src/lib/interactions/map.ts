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
