/**
 * Roster (players) server functions.
 *
 * `public.players` is the source of truth for the RPM goalkeeper roster.
 * Reads are available to any authenticated user. Club corrections are limited
 * to mentor_manager, admin and super_admin — by role, never by name or email —
 * and enforced by RLS on the table itself as well as by the check below.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLUB_EDIT_ROLES, requireRole } from "@/lib/roles.server";

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
      .select(
        "id, full_name, current_club, parent_club, on_loan, league, nationality, instagram_url, contract_until",
      )
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as PlayerRosterRow[];
  });

export const getPlayer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data?.id ?? "")) {
      throw new Error("A canonical player id is required.");
    }
    return { id: data.id };
  })
  .handler(async ({ data, context }): Promise<PlayerRosterRow | null> => {
    const { data: row, error } = await context.supabase
      .from("players")
      .select(
        "id, full_name, current_club, parent_club, on_loan, league, nationality, instagram_url, contract_until",
      )
      .eq("id", data.id)
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
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: row, error: readError } = await context.supabase
      .from("players")
      .select(
        "id, full_name, current_club, parent_club, on_loan, league, nationality, instagram_url, contract_until",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!row) throw new Error("Club was not saved — the player record could not be read back.");
    if (row.current_club !== data.currentClub) {
      throw new Error("Club was not saved — the stored value did not change.");
    }
    return row as PlayerRosterRow;
  });
