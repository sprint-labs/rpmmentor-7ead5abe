import { Link } from "@tanstack/react-router";
import { ArrowRight, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/primitives";
import { DetailFact } from "@/components/workbench-primitives";
import { initialsOf } from "@/lib/initials";
import {
  PILLAR_IDS,
  PILLAR_LABELS,
  type MatchReportRow,
  type PillarId,
} from "@/lib/match-reports/schema";

interface MatchReportWorkbenchProps {
  reports: MatchReportRow[];
  periodLabel: string;
}

/** "2026-09-05" -> "05 Sept 2026"; anything unparseable is shown as-is. */
function formatMatchDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fixtureLabel(report: MatchReportRow): string {
  const home = report.team?.trim();
  const away = report.opponent?.trim();
  if (home && away) return `${home} v ${away}`;
  return home || away || "Fixture not recorded";
}

/**
 * Scores run 1–5. Anything at 3.5+ reads as a strong outing, below 2.5 as one
 * that needs attention; the middle band stays neutral so the list isn't a wall
 * of colour.
 */
function scoreTone(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 3.5) return "text-success";
  if (score < 2.5) return "text-warning";
  return "text-foreground";
}

function PillarScore({ pillar, score }: { pillar: PillarId; score: number | null }) {
  const filled = score ?? 0;
  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {PILLAR_LABELS[pillar]}
      </span>
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={`h-1.5 w-4 rounded-sm ${step <= filled ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </span>
      <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
        {score != null ? `${score}/5` : "—"}
      </span>
    </li>
  );
}

export function MatchReportWorkbench({ reports, periodLabel }: MatchReportWorkbenchProps) {
  const [search, setSearch] = useState("");
  const [coachName, setCoachName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  const coaches = useMemo(
    () => [...new Set(reports.map((report) => report.coach).filter(Boolean))].sort(),
    [reports],
  );
  const teams = useMemo(
    () => [...new Set(reports.map((report) => report.team ?? "").filter(Boolean))].sort(),
    [reports],
  );

  const filteredReports = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-GB");
    return reports.filter((report) => {
      if (coachName && report.coach !== coachName) return false;
      if (teamName && (report.team ?? "") !== teamName) return false;
      if (!query) return true;
      return [
        report.goalkeeper,
        report.coach,
        report.team ?? "",
        report.opponent ?? "",
        report.competition ?? "",
        report.comments,
      ].some((value) => value.toLocaleLowerCase("en-GB").includes(query));
    });
  }, [coachName, reports, search, teamName]);

  const selectedReport =
    filteredReports.find((report) => report.report_id === selectedReportId) ??
    filteredReports[0] ??
    null;

  const hasFilters = Boolean(search || coachName || teamName);

  const scoredReports = filteredReports.filter((report) => report.average != null);
  const periodAverage = scoredReports.length
    ? scoredReports.reduce((total, report) => total + (report.average ?? 0), 0) /
      scoredReports.length
    : null;

  const clearFilters = () => {
    setSearch("");
    setCoachName("");
    setTeamName("");
  };

  const selectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    if (typeof window.matchMedia !== "function") return;
    if (!window.matchMedia("(max-width: 1023px)").matches) return;
    window.requestAnimationFrame(() => {
      detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      detailHeadingRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 border border-border bg-card sm:grid-cols-3">
        <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Reports
          </div>
          <div className="mt-1 font-mono text-xl font-semibold tabular-nums">
            {filteredReports.length}
            {hasFilters ? (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                of {reports.length}
              </span>
            ) : null}
          </div>
        </div>
        <div className="border-b border-border px-4 py-3 sm:border-b-0 sm:border-r">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Period
          </div>
          <div className="mt-1 text-sm font-medium">{periodLabel}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Average score
          </div>
          <div
            className={`mt-1 font-mono text-xl font-semibold tabular-nums ${scoreTone(periodAverage)}`}
          >
            {periodAverage != null ? periodAverage.toFixed(2) : "—"}
          </div>
        </div>
      </div>

      <div className="grid min-w-0 border border-border bg-card lg:grid-cols-[minmax(19rem,0.82fr)_minmax(0,1.18fr)]">
        <section
          className="min-w-0 border-b border-border lg:border-b-0 lg:border-r"
          aria-label="Match reports in period"
        >
          <div className="grid grid-cols-1 gap-2 border-b border-border bg-card p-3 sm:grid-cols-2 lg:sticky lg:top-0 lg:z-[1] lg:grid-cols-1 xl:grid-cols-2">
            <label className="relative sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <span className="sr-only">Search match reports</span>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search goalkeeper, fixture or comments"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label>
              <span className="sr-only">Filter by team</span>
              <select
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All teams</option>
                {teams.map((team) => (
                  <option key={team} value={team}>
                    {team}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by mentor</span>
              <select
                value={coachName}
                onChange={(event) => setCoachName(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All mentors</option>
                {coaches.map((coach) => (
                  <option key={coach} value={coach}>
                    {coach}
                  </option>
                ))}
              </select>
            </label>
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent/40 hover:text-foreground sm:col-span-2 lg:col-span-1 xl:col-span-2"
              >
                <X className="size-3.5" aria-hidden="true" /> Clear filters
              </button>
            ) : null}
          </div>

          <div className="lg:max-h-[min(68vh,48rem)] lg:overflow-y-auto lg:supports-[height:100dvh]:max-h-[min(68dvh,48rem)]">
            {filteredReports.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs text-muted-foreground">
                No match reports match these filters.
              </div>
            ) : (
              filteredReports.map((report) => {
                const isSelected = selectedReport?.report_id === report.report_id;
                return (
                  <button
                    key={report.report_id}
                    type="button"
                    aria-pressed={isSelected}
                    aria-controls="selected-report-detail"
                    aria-label={`Show details for ${report.goalkeeper} on ${formatMatchDate(report.match_date)}`}
                    onClick={() => selectReport(report.report_id)}
                    className={`grid min-h-20 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-3 text-left transition-colors last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring xl:grid-cols-[minmax(0,1.25fr)_minmax(8rem,0.75fr)_auto] ${
                      isSelected
                        ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]"
                        : "hover:bg-accent/25"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden="true">
                        <Avatar initials={initialsOf(report.goalkeeper)} size={28} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          {report.goalkeeper}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {fixtureLabel(report)}
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 xl:block">
                      <span className="block truncate text-[11px] font-medium">
                        {report.coach || "Mentor not recorded"}
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {report.competition?.trim() || formatMatchDate(report.match_date)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className={`block font-mono text-sm font-semibold tabular-nums ${scoreTone(report.average)}`}
                      >
                        {report.average != null ? report.average.toFixed(2) : "—"}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground">
                        {formatMatchDate(report.match_date)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section
          ref={detailPanelRef}
          id="selected-report-detail"
          aria-labelledby={selectedReport ? "selected-report-heading" : undefined}
          aria-label={selectedReport ? undefined : "Selected match report details"}
          className="min-w-0 scroll-mt-20 bg-muted/20 p-4 sm:p-5 lg:max-h-[min(68vh,48rem)] lg:overflow-y-auto lg:supports-[height:100dvh]:max-h-[min(68dvh,48rem)]"
        >
          {selectedReport ? (
            <>
              <p className="sr-only" aria-live="polite">
                Showing details for {selectedReport.goalkeeper}
              </p>
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2
                    ref={detailHeadingRef}
                    id="selected-report-heading"
                    tabIndex={-1}
                    className="break-words text-xl font-semibold tracking-tight"
                  >
                    {selectedReport.goalkeeper}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fixtureLabel(selectedReport)} · {formatMatchDate(selectedReport.match_date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`font-mono text-2xl font-semibold tabular-nums ${scoreTone(selectedReport.average)}`}
                  >
                    {selectedReport.average != null ? selectedReport.average.toFixed(2) : "—"}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Av score
                  </div>
                </div>
              </div>

              <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                <DetailFact label="Mentor" value={selectedReport.coach || "Not recorded"} />
                <DetailFact label="Team" value={selectedReport.team?.trim() || "Not recorded"} />
                <DetailFact
                  label="Opponent"
                  value={selectedReport.opponent?.trim() || "Not recorded"}
                />
                <DetailFact
                  label="Competition"
                  value={selectedReport.competition?.trim() || "Not recorded"}
                />
                <DetailFact label="Match date" value={formatMatchDate(selectedReport.match_date)} />
              </dl>

              <section className="mt-5" aria-labelledby="selected-report-pillars">
                <h3
                  id="selected-report-pillars"
                  className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  RPM pillar scores
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {PILLAR_IDS.map((pillar) => (
                    <PillarScore
                      key={pillar}
                      pillar={pillar}
                      score={selectedReport.scores[pillar] ?? null}
                    />
                  ))}
                </ul>
              </section>

              <section className="mt-5" aria-labelledby="selected-report-comments">
                <h3
                  id="selected-report-comments"
                  className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  Comments
                </h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                  {selectedReport.comments || "No comments recorded."}
                </p>
              </section>

              <Link
                to="/reports/$reportId"
                params={{ reportId: selectedReport.report_id }}
                className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
              >
                Open full report <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <div className="flex min-h-56 items-center justify-center text-center text-xs text-muted-foreground">
              Select a match report to review its complete record.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
