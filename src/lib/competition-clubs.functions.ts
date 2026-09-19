/**
 * Server function behind the Submit Report form's competition and opponent
 * pickers.
 *
 * It returns a small index rather than the rows it is built from: the form only
 * needs names, and shipping the whole roster plus every match report into a
 * modal would be a lot of payload for a dropdown.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCompetitionClubIndex, type CompetitionClubIndex } from "./competition-clubs";

// NOTE: helpers used inside `createServerFn` handlers must be declared inside the
// handler or in a separate imported module — the splitter deletes sibling module-
// scope consts before shipping. See tanstack-serverfn-splitting.

export const getCompetitionClubIndex = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompetitionClubIndex> => {
    const { data: players, error: playersError } = await context.supabase
      .from("players")
      .select("league, current_club, parent_club")
      .is("deleted_at", null);
    if (playersError) throw new Error(playersError.message);

    // Reports come from the canonical store, the same source the report centre
    // reads, so a competition learned here is one the app already displays.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listCanonicalReports } = await import("@/lib/match-reports/store.server");
    const reports = await listCanonicalReports(supabaseAdmin);

    return buildCompetitionClubIndex({
      players: (players ?? []) as {
        league: string;
        current_club: string;
        parent_club: string | null;
      }[],
      reports: reports.map((report) => ({
        competition: report.competition,
        team: report.team,
        opponent: report.opponent,
      })),
    });
  });
