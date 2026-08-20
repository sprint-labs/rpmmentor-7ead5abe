/**
 * Roster (players) server functions.
 *
 * `public.players` is the source of truth for the RPM goalkeeper roster.
 * Reads are available to any authenticated user. Club corrections are limited
 * to mentor_manager, admin and super_admin — by role, never by name or email —
 * and enforced by RLS on the table itself as well as by the check below.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLUB_EDIT_ROLES, requireRole, SUPER_ADMIN_ROLES } from "@/lib/roles.server";
import { londonToday } from "@/lib/time/london";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYER_COLUMNS =
  "id, full_name, current_club, parent_club, on_loan, league, nationality, instagram_url, contract_until";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const nullableHttpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
      return false;
    }
  }, "Enter a valid web address, including https://.")
  .transform((value) => value || null);

export const playerRecordUpdateSchema = z.object({
  id: z.string().regex(UUID, "A canonical player id is required."),
  currentClub: z.string().trim().min(1, "Current club is required.").max(120),
  parentClub: nullableText(120),
  onLoan: z.boolean(),
  league: z.string().trim().max(120),
  nationality: z.string().trim().max(120),
  instagramUrl: nullableHttpUrl,
  contractUntil: nullableText(120),
});

const playerIdSchema = z.object({
  id: z.string().regex(UUID, "A canonical player id is required."),
});

export interface PlayerRosterRow {
  id: string;
  full_name: string;
  current_club: string;
  parent_club: string | null;
  on_loan: boolean;
  league: string;
  nationality: string;
  instagram_url: string | null;
  contract_until: string | null;
}

export const listPlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayerRosterRow[]> => {
    const { data, error } = await context.supabase
      .from("players")
      .select(PLAYER_COLUMNS)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PlayerRosterRow[];
  });

export const getPlayer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => playerIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<PlayerRosterRow | null> => {
    const { data: row, error } = await context.supabase
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as PlayerRosterRow | null) ?? null;
  });

/**
 * Update ONLY `players.current_club`, targeted strictly by `players.id`.
 *
 * Authorisation is enforced in three independent places, because hiding a
 * button is not security:
 *   1. the role check below, which produces a clear message;
 *   2. the `players_update_club_authorised` RLS policy;
 *   3. a database trigger that rejects any change to a column other than
 *      `current_club` for non-super-admins.
 * Success additionally requires a read-back confirming the persisted value.
 */
export const updatePlayerClub = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; currentClub: string }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data?.id ?? "")) {
      throw new Error("A canonical player id is required.");
    }
    const currentClub = (data?.currentClub ?? "").trim();
    if (!currentClub) throw new Error("Club is required.");
    if (currentClub.length > 120) throw new Error("Club must be under 120 characters.");
    return { id: data.id, currentClub };
  })
  .handler(async ({ data, context }): Promise<PlayerRosterRow> => {
    await requireRole(context.supabase, context.userId, CLUB_EDIT_ROLES, "update a player's club");

    const { error } = await context.supabase
      .from("players")
      .update({ current_club: data.currentClub })
      .eq("id", data.id)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);

    const { data: row, error: readError } = await context.supabase
      .from("players")
      .select(PLAYER_COLUMNS)
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("Club was not saved — the player record could not be read back.");
    if (row.current_club !== data.currentClub) {
      throw new Error("Club was not saved — the stored value did not change.");
    }
    return row as PlayerRosterRow;
  });

/**
 * Full non-identity player-record correction, reserved for Super Admins.
 *
 * `id` and `full_name` remain immutable in this first tranche: several legacy
 * goalkeeper-profile views still reconcile a canonical row by normalised name.
 */
export const updatePlayerRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => playerRecordUpdateSchema.parse(data))
  .handler(async ({ data, context }): Promise<PlayerRosterRow> => {
    await requireRole(context.supabase, context.userId, SUPER_ADMIN_ROLES, "edit a player record");

    const { data: updated, error } = await context.supabase
      .from("players")
      .update({
        current_club: data.currentClub,
        parent_club: data.parentClub,
        on_loan: data.onLoan,
        league: data.league,
        nationality: data.nationality,
        instagram_url: data.instagramUrl,
        contract_until: data.contractUntil,
      })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select(PLAYER_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("The player record no longer exists.");

    const row = updated as PlayerRosterRow;
    if (
      row.current_club !== data.currentClub ||
      row.parent_club !== data.parentClub ||
      row.on_loan !== data.onLoan ||
      row.league !== data.league ||
      row.nationality !== data.nationality ||
      row.instagram_url !== data.instagramUrl ||
      row.contract_until !== data.contractUntil
    ) {
      throw new Error("The saved player record could not be confirmed.");
    }
    return row;
  });

export interface PlayerDeletionImpact {
  interactionCount: number;
  openCalendarEventCount: number;
}

/** Pure decision shared by the server guard, UI copy and focused tests. */
export function playerDeletionBlockMessage(impact: PlayerDeletionImpact): string | null {
  if (impact.openCalendarEventCount <= 0) return null;
  const noun = impact.openCalendarEventCount === 1 ? "event" : "events";
  return `Resolve ${impact.openCalendarEventCount} upcoming calendar ${noun} before deleting this player record.`;
}

type PlayerDataClient = Parameters<typeof requireRole>[0];

async function loadPlayerDeletionImpact(
  supabase: PlayerDataClient,
  id: string,
): Promise<PlayerDeletionImpact> {
  const [interactions, calendarEvents] = await Promise.all([
    supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("player_id", id)
      .is("deleted_at", null),
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("player_id", id)
      .gte("event_date", londonToday())
      .neq("status", "cancelled"),
  ]);
  if (interactions.error || calendarEvents.error) {
    throw new Error("Could not confirm the records linked to this player.");
  }
  return {
    interactionCount: interactions.count ?? 0,
    openCalendarEventCount: calendarEvents.count ?? 0,
  };
}

/** Read-only impact preview shown before the destructive confirmation. */
export const getPlayerDeletionImpact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => playerIdSchema.parse(data))
  .handler(async ({ data, context }): Promise<PlayerDeletionImpact> => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPER_ADMIN_ROLES,
      "review player-record deletion impact",
    );

    return loadPlayerDeletionImpact(context.supabase, data.id);
  });

/**
 * Recoverably remove a canonical player from active lists.
 *
 * Historical interactions/calendar rows keep their UUID link and stored name;
 * the player row itself remains available for a controlled database restore.
 */
export const deletePlayerRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => playerIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireRole(
      context.supabase,
      context.userId,
      SUPER_ADMIN_ROLES,
      "delete a player record",
    );

    const impact = await loadPlayerDeletionImpact(context.supabase, data.id);
    const blocked = playerDeletionBlockMessage(impact);
    if (blocked) throw new Error(blocked);

    const deletedAt = new Date().toISOString();
    const { data: deleted, error } = await context.supabase
      .from("players")
      .update({ deleted_at: deletedAt, deleted_by: context.userId })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select("id, full_name, deleted_at, deleted_by")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) return { deleted: false as const, reason: "not_found" as const };
    if (deleted.deleted_at !== deletedAt || deleted.deleted_by !== context.userId) {
      throw new Error("The player-record deletion could not be confirmed.");
    }
    return {
      deleted: true as const,
      id: deleted.id,
      fullName: deleted.full_name,
      deletedAt,
      retainedInteractionCount: impact.interactionCount,
    };
  });
