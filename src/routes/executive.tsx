import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, Card, StatCard, SectionTitle, ProgressBar } from "@/components/primitives";
import { withPermission } from "@/components/require-permission";
import { lastNDaysPeriod } from "@/lib/dashboard-period";
import { getExecutiveDashboardStats } from "@/lib/executive-dashboard.functions";

/** Same window as the Interactions card on the main dashboard. */
const PERIOD_DAYS = 14;
const COVERAGE_DAYS = 30;

export const Route = createFileRoute("/executive")({
  component: withPermission(Executive, "executive.view"),
  head: () => ({
    meta: [
      { title: "Executive Dashboard · Mentor Hub" },
      {
        name: "description",
        content:
          "Live strategic overview of goalkeeper coverage, mentor activity and match report volume.",
      },
      { property: "og:title", content: "Executive Dashboard · Mentor Hub" },
      {
        property: "og:description",
        content:
          "Live strategic overview of goalkeeper coverage, mentor activity and match report volume.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Executive() {
  const period = useMemo(() => lastNDaysPeriod(PERIOD_DAYS), []);
  const fetchStats = useServerFn(getExecutiveDashboardStats);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["executive-dashboard-stats", period.fromDate, period.toDate],
    queryFn: () =>
      fetchStats({
        data: { fromDate: period.fromDate, toDate: period.toDate, coverageDays: COVERAGE_DAYS },
      }),
    staleTime: 30_000,
  });

  const placeholder = isLoading ? "…" : isError ? "—" : 0;
  const coverage =
    data && data.totalGoalkeepers > 0
      ? Math.round((data.coveredGoalkeepers / data.totalGoalkeepers) * 100)
      : null;
  const avgInteractions =
    data && data.activeMentors > 0
      ? (data.interactionsInPeriod / data.activeMentors).toFixed(1)
      : "0.0";
  const maxWeek = Math.max(...(data?.reportWeeks.map((w) => w.count) ?? [0]), 1);
  const maxLeader = Math.max(...(data?.mentorLeaderboard.map((m) => m.interactions) ?? [0]), 1);
  const totalTypes = data?.interactionsByType.reduce((sum, t) => sum + t.count, 0) ?? 0;
  const totalCompetitions = data?.reportsByCompetition.reduce((sum, t) => sum + t.count, 0) ?? 0;

  const interactionsSearch = {
    from: period.from,
    to: period.to,
    mentorId: "",
    type: "",
    source: "executive-interactions",
  };
  const reportsSearch = {
    from: period.fromDate,
    to: period.toDate,
    coach: "",
    mentorProfileId: "",
    source: "executive-reports",
    gk: "",
    openSubmit: "",
    last5Gk: "",
    matchDate: "",
    opponent: "",
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Dashboard"
        description={`Strategic overview for directors and Head of Goalkeeping · live data, last ${PERIOD_DAYS} days.`}
      />

      {isError && (
        <Card className="p-3 text-xs text-muted-foreground">
          Live figures are unavailable right now. Try refreshing in a moment.
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link to="/goalkeepers" className="block rounded-lg" aria-label="View goalkeepers">
          <StatCard
            label={`GK Coverage (${COVERAGE_DAYS}d)`}
            value={coverage == null ? placeholder : `${coverage}%`}
            hint={
              data
                ? `${data.coveredGoalkeepers} of ${data.totalGoalkeepers} player records observed`
                : "Player records observed"
            }
            accent="primary"
          />
        </Link>
        <Link to="/mentors" className="block rounded-lg" aria-label="View mentors">
          <StatCard
            label="Active Mentors"
            value={data?.activeMentors ?? placeholder}
            hint={`${avgInteractions} avg interactions ea. (${PERIOD_DAYS}d)`}
          />
        </Link>
        <Link
          to="/reports"
          search={reportsSearch}
          className="block rounded-lg"
          aria-label="View match reports"
        >
          <StatCard
            label="Reports Submitted"
            value={data?.reportsInPeriod ?? placeholder}
            hint={`Last ${PERIOD_DAYS} days`}
            accent="info"
          />
        </Link>
        <Link
          to="/interactions"
          search={interactionsSearch}
          className="block rounded-lg"
          aria-label="View interactions"
        >
          <StatCard
            label="Interactions Logged"
            value={data?.interactionsInPeriod ?? placeholder}
            hint={`Last ${PERIOD_DAYS} days`}
            accent="warning"
          />
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 lg:col-span-2">
          <SectionTitle>Report Volume — Last 8 Weeks</SectionTitle>
          <div className="flex items-end gap-2 h-48">
            {(data?.reportWeeks ?? []).map((w) => (
              <div key={w.label} className="flex-1 flex flex-col items-center gap-1.5">
                <div className="text-[10px] tabular-nums font-mono text-muted-foreground">{w.count}</div>
                <div
                  className="w-full bg-primary/70 rounded-t hover:bg-primary transition-colors"
                  style={{ height: `${(w.count / maxWeek) * 100}%` }}
                />
                <div className="text-[10px] text-muted-foreground">{w.label}</div>
              </div>
            ))}
            {!data && (
              <div className="text-xs text-muted-foreground">
                {isLoading ? "Loading report volume…" : "No report volume available."}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Interactions by Type</SectionTitle>
          {data && data.interactionsByType.length > 0 ? (
            <div className="space-y-2.5">
              {data.interactionsByType.map((t) => (
                <div key={t.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{t.label}</span>
                    <span className="tabular-nums font-mono font-medium">{t.count}</span>
                  </div>
                  <ProgressBar value={totalTypes ? (t.count / totalTypes) * 100 : 0} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `No interactions logged in the last ${PERIOD_DAYS} days.`}
            </p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle>Reports by Competition</SectionTitle>
          {data && data.reportsByCompetition.length > 0 ? (
            <div className="space-y-2.5">
              {data.reportsByCompetition.map((r) => (
                <div key={r.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="tabular-nums font-mono font-medium">{r.count}</span>
                  </div>
                  <ProgressBar
                    value={totalCompetitions ? (r.count / totalCompetitions) * 100 : 0}
                    tone="info"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `No match reports in the last ${PERIOD_DAYS} days.`}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>Mentor Activity Leaderboard</SectionTitle>
          {data && data.mentorLeaderboard.length > 0 ? (
            <div className="space-y-2">
              {data.mentorLeaderboard.map((m, i) => (
                <div key={m.name} className="flex items-center gap-3">
                  <div className="w-6 text-xs tabular-nums font-mono text-muted-foreground">{i + 1}</div>
                  <div className="flex-1 text-sm font-medium truncate">{m.name}</div>
                  <div className="w-32">
                    <ProgressBar value={(m.interactions / maxLeader) * 100} />
                  </div>
                  <div className="text-xs tabular-nums font-mono w-8 text-right">{m.interactions}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {isLoading ? "Loading…" : `No mentor activity in the last ${PERIOD_DAYS} days.`}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
