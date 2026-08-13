import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, Card, Pill, SectionTitle, EmptyState } from "@/components/primitives";
import { useEffect, useMemo, useState } from "react";
import { FileText, ChevronRight, RefreshCw, X, FilePlus2, NotebookPen } from "lucide-react";
import { goalkeepers as roster } from "@/lib/mock-data";
import { useAuth } from "@/lib/auth";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { withPermission } from "@/components/require-permission";
import { listMatchReports } from "@/lib/match-reports/reports.functions";
import type { MatchReportRow } from "@/lib/match-reports/schema";
import { getNavSource } from "@/lib/nav-source";
import { SyncStatusChip } from "@/components/sync-status-chip";

const reportsSearchSchema = z.object({
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  coach: fallback(z.string(), "").default(""),
  mentorProfileId: fallback(z.string(), "").default(""),
  source: fallback(z.string(), "").default(""),
  gk: fallback(z.string(), "").default(""),
  openSubmit: fallback(z.string(), "").default(""),
  /** The scheduled Match this report writes up, when opened from a follow-up. */
  eventId: fallback(z.string(), "").default(""),
  last5Gk: fallback(z.string(), "").default(""),
  matchDate: fallback(z.string(), "").default(""),
  opponent: fallback(z.string(), "").default(""),
});

function normaliseName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function compareMatchDatesNewestFirst(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

export const Route = createFileRoute("/reports/")({
  validateSearch: zodValidator(reportsSearchSchema),
  component: withPermission(ReportsPage, "reports.view"),
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ReportsPage() {
  const { can } = useAuth();
  const { from, to, coach, source, gk, openSubmit, last5Gk, matchDate, opponent, eventId } =
    Route.useSearch();
  const navSource = getNavSource(source);
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const [prefillGoalkeeper, setPrefillGoalkeeper] = useState<string>("");
  const [prefillMatchDate, setPrefillMatchDate] = useState<string>("");
  const [prefillOpponent, setPrefillOpponent] = useState<string>("");
  /** The scheduled Match this submission writes up, if opened from a follow-up. */
  const [followUpEventId, setFollowUpEventId] = useState<string>("");
  /** Goalkeeper/date carried into Log Interaction from a report row. */
  const [logPrefill, setLogPrefill] = useState<{ gkId?: string; date?: string }>({});
  const [coachFilter, setCoachFilter] = useState<string>(coach || "All");
  const router = useRouter();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMatchReports);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["match-reports"],
    queryFn: () => listFn(),
    staleTime: 30_000,
  });

  const reports: MatchReportRow[] = data?.reports ?? [];

  useEffect(() => {
    const h = () => {
      void queryClient.invalidateQueries({ queryKey: ["match-reports"] });
      router.invalidate();
    };
    window.addEventListener("rpm:report-submitted", h);
    return () => window.removeEventListener("rpm:report-submitted", h);
  }, [queryClient, router]);

  useEffect(() => {
    if (coach) setCoachFilter(coach);
  }, [coach]);

  // Auto-open the Submit Match Report dialog when navigated from a goalkeeper CTA
  // or a calendar match event.
  useEffect(() => {
    if (openSubmit === "1" && can("reports.submit")) {
      setPrefillGoalkeeper(gk || "");
      setPrefillMatchDate(matchDate || "");
      setPrefillOpponent(opponent || "");
      setFollowUpEventId(eventId || "");
      setWorkflow("report");
      // Strip the one-shot params so a refresh doesn't reopen the dialog.
      router.navigate({
        to: "/reports",
        search: { from, to, coach, mentorProfileId: "", source, gk: "", openSubmit: "", last5Gk, matchDate: "", opponent: "", eventId: "" },
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSubmit, gk, matchDate, opponent, eventId]);

  const coaches = useMemo(() => {
    const s = new Set<string>();
    reports.forEach((r) => r.coach && s.add(r.coach));
    return ["All", ...Array.from(s).sort()];
  }, [reports]);

  const goalkeepers = useMemo(() => {
    const s = new Set<string>();
    reports.forEach((r) => r.goalkeeper && s.add(r.goalkeeper));
    return Array.from(s).sort();
  }, [reports]);

  // The set of report IDs that are actually included in the last-5 averages for
  // the selected goalkeeper — matches the logic on the goalkeeper profile.
  const last5Ids = useMemo(() => {
    if (!last5Gk) return null;
    const target = normaliseName(last5Gk);
    const ids = reports
      .filter((r) => normaliseName(r.goalkeeper) === target)
      .sort((a, b) => compareMatchDatesNewestFirst(a.match_date, b.match_date))
      .slice(0, 5)
      .map((r) => r.report_id);
    return new Set(ids);
  }, [reports, last5Gk]);

  const filtered = useMemo(() => {
    let list = coachFilter === "All" ? reports : reports.filter((r) => r.coach === coachFilter);
    if (from && to) {
      const start = new Date(from).getTime();
      const end = new Date(to).getTime();
      list = list.filter((r) => {
        if (!r.match_date) return false;
        const t = new Date(r.match_date).getTime();
        return t >= start && t <= end;
      });
    }
    if (last5Ids) list = list.filter((r) => last5Ids.has(r.report_id));
    return list;
  }, [reports, coachFilter, from, to, last5Ids]);

  /** Report goalkeeper names resolved to roster ids so rows can link and prefill. */
  const rosterByName = useMemo(() => {
    const m = new Map<string, (typeof roster)[number]>();
    for (const g of roster) m.set(normaliseName(g.name), g);
    return m;
  }, []);

  function openLog(prefill: { gkId?: string; date?: string } = {}) {
    setLogPrefill(prefill);
    setWorkflow("interaction");
  }

  const hasFilters = Boolean(coach) || (Boolean(from) && Boolean(to)) || Boolean(last5Gk);
  const clearSearch = { from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: "", openSubmit: "", last5Gk: "" };

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={
          navSource
            ? [
                { label: "Dashboard", to: "/" },
                { label: navSource.label },
              ]
            : undefined
        }
        title={navSource?.title ?? "Match Report Submission Centre"}
        description={
          isLoading
            ? "Loading match reports from Google Sheets…"
            : `${reports.length} match reports · source: RPM Match Reports Sheet`
        }
        action={
          <div className="flex items-center gap-2">
            <SyncStatusChip />
            <button onClick={() => refetch()} disabled={isFetching}
              className="h-9 px-3 rounded-md border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
              <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {can("interactions.log") && (
              <button onClick={() => openLog()}
                className="h-9 px-3 rounded-md border border-border text-sm font-medium inline-flex items-center gap-1.5">
                <NotebookPen className="size-3.5" /> Log Interaction
              </button>
            )}
            {can("reports.submit") && (
              <button onClick={() => setWorkflow("report")}
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium">
                Submit Match Report
              </button>
            )}
          </div>
        }
      />


      {error ? (
        <Card className="p-4 text-sm text-destructive">
          Couldn't load reports: {(error as Error).message}
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {coaches.map((c) => (
          <button key={c} onClick={() => setCoachFilter(c)}
            className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${
              coachFilter === c
                ? "bg-accent border-accent text-accent-foreground"
                : "border-border hover:bg-accent/40 text-muted-foreground"
            }`}>
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="text-muted-foreground uppercase tracking-wider" htmlFor="last5-gk">
          Last-5 averages for
        </label>
        <select
          id="last5-gk"
          value={last5Gk}
          onChange={(e) =>
            router.navigate({
              to: "/reports",
              search: { from, to, coach, mentorProfileId: "", source, gk: "", openSubmit: "", last5Gk: e.target.value },
              replace: true,
            })
          }
          className="h-8 px-2 rounded-md border border-border bg-background text-xs"
        >
          <option value="">All reports</option>
          {goalkeepers.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        {last5Gk && (
          <Link
            to="/reports"
            search={{ from, to, coach, mentorProfileId: "", source, gk: "", openSubmit: "", last5Gk: "" }}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" /> Clear
          </Link>
        )}
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground uppercase tracking-wider">Scoped to:</span>
          {coach && <Pill tone="muted">{coach}</Pill>}
          {from && to && <Pill tone="muted">{new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(to).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Pill>}
          {last5Gk && <Pill tone="muted">Last 5 · {last5Gk}</Pill>}
          <Link to="/reports" search={clearSearch} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground ml-2">
            <X className="size-3" /> Clear
          </Link>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="px-4 py-2.5 font-medium">Match Date</th>
                <th className="px-2 py-2.5 font-medium">Goalkeeper</th>
                <th className="px-2 py-2.5 font-medium">Coach</th>
                <th className="px-2 py-2.5 font-medium">Team</th>
                <th className="px-2 py-2.5 font-medium">Opponent</th>
                <th className="px-2 py-2.5 font-medium">Comments</th>
                <th className="px-2 py-2.5 font-medium text-right">Avg</th>
                <th className="px-4 py-2.5 font-medium text-right" />
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-2">
                    <EmptyState
                      icon={FileText}
                      title={hasFilters ? "No match reports match these filters" : "No match reports yet"}
                      description={
                        hasFilters
                          ? "Try widening the date range or clearing the coach filter to see more results."
                          : can("reports.submit")
                            ? "Submit your first match report to start building the reporting record for this window."
                            : "Match reports submitted by coaches will appear here."
                      }
                      primaryAction={
                        hasFilters ? (
                          <Link
                            to="/reports"
                            search={clearSearch}
                            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
                          >
                            <X className="size-3.5" /> Clear filters
                          </Link>
                        ) : can("reports.submit") ? (
                          <button
                            onClick={() => setWorkflow("report")}
                            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium inline-flex items-center gap-1.5"
                          >
                            <FilePlus2 className="size-3.5" /> Submit match report
                          </button>
                        ) : undefined
                      }
                      secondaryAction={
                        hasFilters ? (
                          <button
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="h-9 px-3 rounded-md border border-border text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                          >
                            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
                          </button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}
              {filtered.slice(0, 100).map((r) => (
                <tr key={r.report_id} className="border-b border-border/60 last:border-0 hover:bg-accent/20">
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums font-mono whitespace-nowrap">{formatDate(r.match_date)}</td>
                  <td className="px-2 font-medium">
                    {rosterByName.get(normaliseName(r.goalkeeper)) ? (
                      <Link
                        to="/goalkeepers/$gkId"
                        params={{ gkId: rosterByName.get(normaliseName(r.goalkeeper))!.id }}
                        className="hover:underline"
                      >
                        {r.goalkeeper}
                      </Link>
                    ) : (
                      r.goalkeeper
                    )}
                  </td>
                  <td className="px-2 text-muted-foreground">{r.coach}</td>
                  <td className="px-2 text-muted-foreground">{r.team ?? "—"}</td>
                  <td className="px-2 text-muted-foreground">{r.opponent ?? "—"}</td>
                  <td className="px-2 text-muted-foreground max-w-md"><span className="line-clamp-1">{r.comments}</span></td>
                  <td className="px-2 text-right tabular-nums font-mono font-semibold">{r.average != null ? r.average.toFixed(1) : "—"}</td>
                  <td className="px-4 text-right">
                    <div className="inline-flex items-center gap-3">
                      {can("interactions.log") && (
                        <button
                          onClick={() =>
                            openLog({
                              gkId: rosterByName.get(normaliseName(r.goalkeeper))?.id,
                              date: r.match_date ?? undefined,
                            })
                          }
                          title={`Log interaction for ${r.goalkeeper}`}
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <NotebookPen className="size-3" /> Log
                        </button>
                      )}
                      <Link to="/reports/$reportId" params={{ reportId: r.report_id }} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
                        Open <ChevronRight className="size-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle>Showing {Math.min(100, filtered.length)} of {filtered.length}</SectionTitle>
      <WorkflowDialog
        kind={workflow}
        onClose={() => { setWorkflow(null); setPrefillGoalkeeper(""); setPrefillMatchDate(""); setPrefillOpponent(""); setFollowUpEventId(""); setLogPrefill({}); }}
        prefillGoalkeeper={prefillGoalkeeper}
        prefillMatchDate={workflow === "interaction" ? logPrefill.date : prefillMatchDate}
        prefillOpponent={prefillOpponent}
        prefillGkId={logPrefill.gkId}
        followUpEventId={workflow === "report" ? followUpEventId || undefined : undefined}
      />
    </div>
  );
}
