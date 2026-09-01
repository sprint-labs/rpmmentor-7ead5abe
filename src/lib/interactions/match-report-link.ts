/**
 * Match Report → Live Match Observation interaction.
 *
 * A Live Match Observation is never logged by hand. It is created here, on the
 * server, as part of a successful Match Report submission, so the two can never
 * disagree about the goalkeeper, date or club.
 *
 * Duplicate prevention is enforced by the DATABASE, not by this code: the
 * partial unique index `interactions_match_report_id_key` allows at most one
 * interaction per `match_report_id`. Retries, refreshes and repeated callbacks
 * therefore converge on the same single row instead of stacking up duplicates —
 * this function is safe to call any number of times for the same report.
 */
import { INTERACTION_COLUMNS, mapInteractionRow } from "@/lib/interactions/map";
import { MATCH_REPORT_INTERACTION_TYPE, type LoggedInteraction } from "@/lib/interactions/schema";

/** Postgres unique-violation. Means another call won the race — not an error. */
const UNIQUE_VIOLATION = "23505";

export interface MatchReportInteractionInput {
  /** Canonical Match Report identity, e.g. "mr2_ab12cd34" or "mr2_ab12cd34~2". */
  reportId: string;
  /** Canonical calendar-event player. When present, no name lookup is used. */
  playerId?: string | null;
  goalkeeperName: string;
  /** Club the goalkeeper played for — the report's Team column. */
  club: string;
  /** Calendar date of the match, "YYYY-MM-DD". */
  matchDate: string;
  mentorId: string;
  mentorName: string;
  notes: string;
}

export type MatchReportInteractionResult =
  { ok: true; interaction: LoggedInteraction; created: boolean } | { ok: false; message: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = {
  from: (table: string) => any;
};

/**
 * Create the interaction for a submitted Match Report, or return the one that
 * already exists for it.
 *
 * Never throws: the caller has already written the report, so a failure here
 * must be reported as a partial result rather than taking down a completed
 * submission or, worse, being swallowed into a false success.
 */
export async function ensureMatchReportInteraction(
  db: Db,
  input: MatchReportInteractionInput,
): Promise<MatchReportInteractionResult> {
  const select = () =>
    db
      .from("interactions")
      .select(INTERACTION_COLUMNS)
      .eq("match_report_id", input.reportId)
      .is("deleted_at", null)
      .maybeSingle();

  try {
    // Already linked? Then this is a retry or a replayed callback.
    const existing = await select();
    if (existing.error) return { ok: false, message: existing.error.message };
    if (existing.data) {
      return { ok: true, interaction: mapInteractionRow(existing.data), created: false };
    }

    // A linked calendar Match already has a canonical players.id. Standalone
    // reports keep the legacy exact-name lookup for backward compatibility.
    let playerId = input.playerId ?? null;
    if (!playerId) {
      const { data: player } = await db
        .from("players")
        .select("id")
        .ilike("full_name", input.goalkeeperName.trim())
        .is("deleted_at", null)
        .maybeSingle();
      playerId = player?.id ?? null;
    }

    const inserted = await db
      .from("interactions")
      .insert({
        mentor_id: input.mentorId,
        mentor_name: input.mentorName,
        player_id: playerId,
        goalkeeper_name: input.goalkeeperName,
        gk_slug: "",
        interaction_type: MATCH_REPORT_INTERACTION_TYPE,
        club: input.club,
        occurred_at: input.matchDate,
        notes: input.notes,
        outcome: "",
        follow_up: "",
        match_report_id: input.reportId,
      })
      .select(INTERACTION_COLUMNS)
      .single();

    if (inserted.error) {
      // Another concurrent submission created it first. The database did its
      // job; read the winner back and report success.
      if (inserted.error.code === UNIQUE_VIOLATION) {
        const raced = await select();
        if (!raced.error && raced.data) {
          return { ok: true, interaction: mapInteractionRow(raced.data), created: false };
        }
      }
      return { ok: false, message: inserted.error.message };
    }
    if (!inserted.data) {
      return { ok: false, message: "The interaction could not be confirmed as saved." };
    }
    return { ok: true, interaction: mapInteractionRow(inserted.data), created: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "The interaction could not be saved.",
    };
  }
}

/**
 * Summary line stored as the interaction's notes, so the interaction is
 * self-describing in the log and timeline without having to join to the report.
 */
export function matchReportInteractionNotes(input: {
  opponent: string;
  competition?: string;
  average?: number | null;
  comments?: string;
}): string {
  const head = [
    `Match report submitted${input.opponent ? ` v ${input.opponent}` : ""}`,
    input.competition ? `(${input.competition})` : "",
    typeof input.average === "number" && Number.isFinite(input.average)
      ? `— overall ${input.average.toFixed(2)}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const body = (input.comments ?? "").trim();
  return body ? `${head}\n\n${body}` : head;
}
