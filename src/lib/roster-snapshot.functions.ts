import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { OVERVIEW_DASHBOARD_ROLES, requireRole } from "@/lib/roles.server";
import { buildRosterSnapshot, type RosterSnapshot } from "@/lib/roster-snapshot";

/**
 * Live Roster Snapshot counts, read from `public.players`.
 *
 * These were previously computed at module load from a static fixture, so the
 * panel kept showing numbers after the database went away. Reading them here
 * means a failed read surfaces as an error the panel can report, never as a
 * stale or invented count.
 */
export const getRosterSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RosterSnapshot> => {
    const { supabase, userId } = context;
    await requireRole(supabase, userId, OVERVIEW_DASHBOARD_ROLES, "view the management dashboard");

    const { data, error } = await supabase.from("players").select("tier").is("deleted_at", null);
    if (error) throw new Error("Could not load the roster snapshot.");

    return buildRosterSnapshot(data ?? []);
  });
