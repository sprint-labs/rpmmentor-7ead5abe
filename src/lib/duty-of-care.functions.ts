/**
 * Duty-of-care server functions.
 *
 * The RAG status itself is computed in the database by `duty_of_care_at()`,
 * surfaced through the `public.player_duty_of_care` view. Nothing here
 * recalculates it — the read below is a straight projection of that view, and
 * the write below only records a reset row that the same function already
 * folds into its "last interaction" maths.
 *
 * Resetting is limited to mentor_manager, admin and super_admin — by role,
 * never by name or email — and enforced twice: by the check below, which
 * produces a clear message, and by the `duty_of_care_resets_insert_managers`
 * RLS policy on the table itself.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DUTY_OF_CARE_RESET_ROLES, requireRole } from "@/lib/roles.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DUTY_COLUMNS =
  "player_id, full_name, tier, state, rag_status, status_label, last_interaction_at, next_due_at, days_until_due, season_count, period_target, checkpoints_due, is_off_season";

const playerIdSchema = z.object({
  player_id: z.string().regex(UUID, "A canonical player id is required."),
});

const resetSchema = z.object({
  player_id: z.string().regex(UUID, "A canonical player id is required."),
  reason: z.string().trim().max(500, "Reason must be under 500 characters.").default(""),
});

/** Every state `duty_of_care_at()` can return, kept in one place for the UI. */
export type DutyOfCareState =
  "red" | "amber" | "green" | "complete" | "off_season" | "not_required" | "no_data";

export type DutyOfCareRag = "red" | "amber" | "green" | "none";

export interface PlayerDutyOfCareRow {
  player_id: string;
  full_name: string | null;
  tier: string | null;
  state: DutyOfCareState | null;
  rag_status: DutyOfCareRag | null;
  status_label: string | null;
  last_interaction_at: string | null;
  next_due_at: string | null;
  days_until_due: number | null;
  season_count: number | null;
  period_target: number | null;
  checkpoints_due: number | null;
  is_off_season: boolean | null;
}

/** Live duty-of-care row for one goalkeeper, straight from the database view. */
export const getPlayerDutyOfCare = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { player_id: string }) => playerIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<PlayerDutyOfCareRow | null> => {
    const { data: row, error } = await context.supabase
      .from("player_duty_of_care")
      .select(DUTY_COLUMNS)
      .eq("player_id", data.player_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as PlayerDutyOfCareRow | null) ?? null;
  });

export interface DutyOfCareResetResult {
  id: string;
  player_id: string;
  reason: string;
  reset_at: string;
  created_by_name: string;
}

/**
 * Record a duty-of-care reset for one goalkeeper.
 *
 * `reset_at` and `created_at` are left to their `now()` defaults so the stored
 * time is the database's, not the caller's clock. `created_by` must be the
 * caller's own `auth.uid()` — the RLS policy checks it as well — and the
 * display name is read server-side from `profiles` rather than trusted from
 * the client.
 */
export const resetDutyOfCare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => resetSchema.parse(data))
  .handler(async ({ data, context }): Promise<DutyOfCareResetResult> => {
    const { supabase, userId } = context;
    await requireRole(
      supabase,
      userId,
      DUTY_OF_CARE_RESET_ROLES,
      "reset a goalkeeper's duty of care",
    );

    // The player must exist and still be active, so a reset can never be
    // recorded against a stale or deleted id.
    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id")
      .eq("id", data.player_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (playerError) throw new Error(playerError.message);
    if (!player) throw new Error("The player record no longer exists.");

    // Identity is derived server-side, never client-supplied.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const createdByName = (profile?.name || profile?.email || "").trim();

    const { data: inserted, error } = await supabase
      .from("duty_of_care_resets")
      .insert({
        player_id: data.player_id,
        reason: data.reason,
        created_by: userId,
        created_by_name: createdByName,
      })
      .select("id, player_id, reason, reset_at, created_by, created_by_name")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error("The duty-of-care reset could not be confirmed.");
    if (inserted.created_by !== userId) {
      throw new Error("The duty-of-care reset could not be confirmed.");
    }

    return {
      id: inserted.id,
      player_id: inserted.player_id,
      reason: inserted.reason,
      reset_at: inserted.reset_at,
      created_by_name: inserted.created_by_name,
    };
  });
