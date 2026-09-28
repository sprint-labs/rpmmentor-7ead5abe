/**
 * `/goalkeepers/:gkId/dossier` — the dossier as its own page.
 *
 * A non-nested route (the trailing `_` on `goalkeepers_`) so the document owns
 * the page instead of appearing inside the profile: it is meant to be read
 * end to end, printed, or exported, and a printable document cannot sit in the
 * middle of another screen's scroll.
 *
 * The goalkeeper is resolved exactly as `/goalkeepers/$gkId` resolves him —
 * same query key, same `rosterRowForLegacySlug`, same `withSeedNarrative` — so
 * arriving from the profile costs no extra request and cannot disagree with the
 * page it was opened from. Loading, roster failure and genuine 404 stay three
 * visibly different outcomes for the same reason they do there: a goalkeeper
 * whose row is still in flight must never read as one who does not exist.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GoalkeeperDossierDocument } from "@/components/goalkeeper-dossier";
import { buildGoalkeeperDossier } from "@/lib/dossier/goalkeeper-dossier";
import { exportGoalkeeperDossierPdf } from "@/lib/dossier/goalkeeper-dossier-pdf";
import {
  interactionsForGoalkeeper,
  reportsForGoalkeeper,
} from "@/lib/dossier/goalkeeper-dossier-sources";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { listMatchReports } from "@/lib/match-reports/reports.functions";
import { listPlayers } from "@/lib/players.functions";
import { rosterRowForLegacySlug, toGoalkeeper } from "@/lib/roster/live-goalkeepers";
import { withSeedNarrative } from "@/lib/roster/goalkeeper-profile";

export const Route = createFileRoute("/goalkeepers_/$gkId/dossier")({
  component: GoalkeeperDossierPage,
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">Goalkeeper not found.</div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">{error.message}</div>
  ),
});

function GoalkeeperDossierPage() {
  const { gkId } = Route.useParams();
  const listPlayersFn = useServerFn(listPlayers);
  const listReportsFn = useServerFn(listMatchReports);

  const {
    data: players,
    isPending: rosterPending,
    isError: rosterUnavailable,
  } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    staleTime: 5 * 60_000,
  });
  const { data: reportData } = useQuery({
    queryKey: ["match-reports"],
    queryFn: () => listReportsFn(),
    staleTime: 60_000,
  });
  const { data: loggedInteractions } = useLoggedInteractions();

  const player = useMemo(() => rosterRowForLegacySlug(players, gkId), [players, gkId]);
  const gk = useMemo(() => (player ? withSeedNarrative(toGoalkeeper(player)) : null), [player]);

  const dossier = useMemo(() => {
    if (!gk || !player) return null;
    return buildGoalkeeperDossier({
      gk,
      reports: reportsForGoalkeeper(reportData?.reports, gk.name),
      interactions: interactionsForGoalkeeper(loggedInteractions, gk, player.id),
    });
  }, [gk, player, reportData, loggedInteractions]);

  const [exporting, setExporting] = useState(false);

  if (rosterPending) {
    return (
      <div className="p-8 text-sm text-muted-foreground" role="status">
        Loading dossier…
      </div>
    );
  }

  if (rosterUnavailable && !players) {
    return (
      <div className="p-8 text-sm text-destructive" role="status">
        The roster could not be loaded. Refresh the page to try again.
      </div>
    );
  }

  if (!gk || !dossier) throw notFound();

  const onExport = async () => {
    setExporting(true);
    try {
      const filename = await exportGoalkeeperDossierPdf(dossier);
      toast.success(`Dossier exported as ${filename}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the dossier");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Link
          to="/goalkeepers/$gkId"
          params={{ gkId }}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {gk.name}
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
          <Button size="sm" onClick={onExport} disabled={exporting}>
            <Download /> {exporting ? "Exporting…" : "Export PDF"}
          </Button>
        </div>
      </div>

      <GoalkeeperDossierDocument dossier={dossier} />
    </div>
  );
}
