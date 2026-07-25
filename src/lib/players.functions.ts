/**
 * Roster (players) server functions.
 *
 * `public.players` is the source of truth for the RPM goalkeeper roster.
 * Reads are available to any authenticated user; writes are restricted to
 * super admins via RLS policies on the table itself.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
