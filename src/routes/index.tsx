import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, PageHeader, StatCard, SectionTitle, Avatar, Pill, TierBadge, TrafficLight } from "@/components/primitives";
import { activity, alerts, goalkeepers, stats, formatRelative, getMentor, computeDutyOverview } from "@/lib/mock-data";
import { useDutySource, useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { ErrorBoundary } from "@/components/error-boundary";


function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

import { ArrowUpRight, AlertTriangle, CalendarClock, FileText, Users, UserCog } from "lucide-react";
import { useAuth, ROLE_LABEL } from "@/lib/auth";
import { MentorDashboard } from "@/components/mentor/mentor-dashboard";
import { SyncStatusChip } from "@/components/sync-status-chip";
import { listMatchReports } from "@/lib/match-reports/reports.functions";

import { isDateOnlyInPeriod, lastNDaysPeriod } from "@/lib/dashboard-period";
import { getOverviewDashboardStats } from "@/lib/overview-dashboard.functions";

const OVERVIEW_PERIOD_DAYS = 14;


export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listReports = useServerFn(listMatchReports);
  const { data: reportsData, isLoading: reportsLoading, isError: reportsError } = useQuery({
    // Share the Reports page cache so the dashboard number and the
    // destination list are based on the same Sheets read.
    queryKey: ["match-reports"],
    queryFn: () => listReports(),
    enabled: Boolean(user && user.role !== "mentor"),
    staleTime: 30_000,
    retry: 1,
  });
  // One shared window for every period-scoped KPI card on this page, matching
  // the window used by the mentor Interactions card.
  const period = useMemo(() => lastNDaysPeriod(OVERVIEW_PERIOD_DAYS), []);
  const fetchOverview = useServerFn(getOverviewDashboardStats);
  const { data: overview } = useQuery({
    queryKey: ["overview-dashboard-stats", period.fromDate, period.toDate],
    queryFn: () => fetchOverview({ data: { fromDate: period.fromDate, toDate: period.toDate } }),
    enabled: Boolean(user && user.role !== "mentor"),
    staleTime: 30_000,
  });
  const reportsInPeriod = reportsData?.reports.filter((report) =>
    isDateOnlyInPeriod(report.match_date, period.fromDate, period.toDate),
  ).length;
  const reportsSearch = {
    from: period.fromDate,
    to: period.toDate,
    coach: "",
    mentorProfileId: "",
    source: "",
    gk: "",
    openSubmit: "",
    last5Gk: "",
    matchDate: "",
    opponent: "",
  };
  const interactionsSearch = {
    from: period.from,
    to: period.to,
    mentorId: "",
    type: "",
    source: "interactions-logged",
  };


  useEffect(() => {
    if (!user) navigate({ to: "/login", search: { next: "/" }, replace: true });
  }, [user, navigate]);

  // Hooks must run unconditionally — this query stays above every early return
  // and is disabled unless a signed-in, non-mentor user is viewing the page.
  const {
    data: loggedInteractions,
    isLoading: interactionsLoading,
    isError: interactionsError,
  } = useLoggedInteractions(Boolean(user) && user?.role !== "mentor");
  const dutySource = useMemo(
    () =>
      (loggedInteractions ?? []).map((i) => ({
        gkId: i.gkSlug,
        type: i.interactionType,
        date: i.occurredAt,
      })),
    [loggedInteractions],
  );

  // Recent Activity merges durable interactions with other real events, so a
  // newly logged interaction appears as soon as the shared cache refreshes.
  const recentActivity = useMemo(
    () =>
      [
        ...activity,
        ...(loggedInteractions ?? []).map((i) => ({
          id: `interaction-${i.id}`,
          actor: i.mentorName || "Mentor",
          actorInitials: initialsOf(i.mentorName || "Mentor"),
          action: `logged a ${i.interactionType.toLowerCase()} with`,
          target: i.goalkeeperName,
          gkId: i.gkSlug,
          date: i.occurredAt,
        })),
      ]
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 8),
    [loggedInteractions],
  );

  if (!user) return null;

  // Dedicated mentor experience — only the stat cards shown below are mentor-specific.
  if (user.role === "mentor") {
    return <MentorDashboard user={user} mentorProfileId={user.mentorId ?? ""} />;
  }

  const dutyOverview = computeDutyOverview(dutySource);


  // Upcoming interactions come from scheduled calendar events only. There is
  // no sample/placeholder fallback — an empty schedule shows an empty state.
  const upcoming = calendarEvents
    .filter((e) => +new Date(e.date) >= Date.now())
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .slice(0, 6);

  const greeting = `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`;

  return (
    <div className="space-y-6">
      <PageHeader title={greeting} description={`${ROLE_LABEL[user.role]} view · overview of goalkeeper coverage and outstanding actions.`} action={<SyncStatusChip />} />


      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Link
          to="/goalkeepers"
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View goalkeepers"
        >
          <StatCard
            label="Total Goalkeepers"
            value={overview?.totalGoalkeepers ?? "…"}
            hint="Player records on file"
          />
        </Link>
        <Link
          to="/interactions"
          search={interactionsSearch}
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-info/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
          aria-label="View interactions logged"
        >
          <StatCard
            label="Interactions Logged"
            value={overview?.interactionsInPeriod ?? "…"}
            hint={`Last ${OVERVIEW_PERIOD_DAYS} days`}
            accent="info"
            emptyMessage="None logged"
          />
        </Link>
        <Link
          to="/goalkeepers"
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-destructive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          aria-label="View overdue goalkeepers"
        >
          <StatCard
            label="Overdue Duty of Care"
            value={interactionsLoading ? "…" : interactionsError ? "—" : dutyOverview.overdue}
            hint={interactionsError ? "Count unavailable" : "Past tier cadence"}
            accent="destructive"
            emptyMessage="All caught up"
          />
        </Link>
        <Link
          to="/reports"
          search={reportsSearch}
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View match reports"
        >
          <StatCard
            label="Match Reports Submitted"
            value={reportsLoading ? "…" : reportsError || reportsInPeriod == null ? "—" : reportsInPeriod}
            hint={reportsError ? "Report count unavailable" : `Last ${OVERVIEW_PERIOD_DAYS} days`}
            accent="primary"
            emptyMessage="None submitted"
          />
        </Link>
        <Link
          to="/mentors"
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View users and roles"
        >
          <StatCard
            label="Active Mentors"
            value={overview?.activeMentors ?? "…"}
            hint="Accounts with mentor access"
          />
        </Link>

      </div>
      <Card className="p-4">
        <SectionTitle action={<Link to="/goalkeepers" className="text-xs text-primary inline-flex items-center gap-1">View goalkeepers <ArrowUpRight className="size-3" /></Link>}>
          Duty of Care · Traffic Light
        </SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {([
            { level: "up_to_date", label: "Up to date", count: dutyOverview.up_to_date, hint: "On cadence for tier", bar: "bg-success" },
            { level: "due_soon", label: "Due soon", count: dutyOverview.due_soon, hint: "Approaching cadence", bar: "bg-warning" },
            { level: "overdue", label: "Overdue", count: dutyOverview.overdue, hint: "Past required cadence", bar: "bg-destructive" },
            { level: "not_required", label: "Not required", count: dutyOverview.not_required, hint: "Tier 4 — no formal duty", bar: "bg-muted-foreground/50" },
            { level: "not_enough_data", label: "Not enough data", count: dutyOverview.not_enough_data, hint: "Missing tier or interactions", bar: "bg-muted-foreground/50" },
          ] as const).map((b) => {
            const pct = Math.round((b.count / Math.max(1, dutyOverview.total)) * 100);
            return (
              <div key={b.level} className="rounded-md border border-border/60 bg-accent/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrafficLight level={b.level} size={12} />
                    <span className="text-sm font-medium">{b.label}</span>
                  </div>
                  <span className="tabular-nums font-mono text-lg font-semibold">{b.count}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{b.hint}</div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-2">
                  <div className={`h-full ${b.bar}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 tabular-nums font-mono">{pct}% of roster</div>
              </div>
            );
          })}
        </div>
      </Card>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <SectionTitle action={<Link to="/calendar" className="text-xs text-primary inline-flex items-center gap-1">Open calendar <ArrowUpRight className="size-3" /></Link>}>
            Upcoming Interactions
          </SectionTitle>
          <div className="divide-y divide-border">
            {upcoming.map((gk) => {
              const m = getMentor(gk.mentorId);
              return (
                <Link key={gk.id} to="/goalkeepers/$gkId" params={{ gkId: gk.id }} className="flex items-center gap-3 py-2.5 hover:bg-accent/30 -mx-2 px-2 rounded-md transition-colors">
                  <Avatar initials={gk.initials} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{gk.name}</span>
                      <TierBadge tier={gk.tier} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{gk.club} · {gk.league}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium tabular-nums font-mono flex items-center gap-1 justify-end"><CalendarClock className="size-3 text-muted-foreground" />{formatRelative(gk.nextInteraction)}</div>
                    <div className="text-[11px] text-muted-foreground">w/ {m?.name.split(" ")[1]}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle action={<Link to="/alerts" className="text-xs text-primary inline-flex items-center gap-1">All alerts <ArrowUpRight className="size-3" /></Link>}>
            Alerts Requiring Attention
          </SectionTitle>
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3 rounded-md border border-dashed border-border/60 text-center">
                No alerts. New overdue observations, missing reports and duty-of-care warnings will appear here.
              </div>
            ) : alerts.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-start gap-2 p-2 rounded-md bg-accent/30 border border-border/50">
                <AlertTriangle className={`size-3.5 mt-0.5 shrink-0 ${a.severity === "high" ? "text-destructive" : a.severity === "medium" ? "text-warning" : "text-info"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{a.message}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Pill tone={a.severity === "high" ? "destructive" : a.severity === "medium" ? "warning" : "info"}>{a.kind}</Pill>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ErrorBoundary
          fallback={(reset) => (
            <Card className="lg:col-span-2 p-4">
              <SectionTitle>Recent Activity</SectionTitle>
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Recent activity unavailable</p>
                  <p className="text-destructive/80">Something went wrong loading the latest interactions. The rest of the dashboard is still working.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-3 inline-flex h-8 items-center justify-center rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Retry
              </button>
            </Card>
          )}
        >

          <Card className="lg:col-span-2 p-4">
            <SectionTitle>Recent Activity</SectionTitle>
            <div className="space-y-2">
              {interactionsLoading ? (
                <div className="text-xs text-muted-foreground p-3 rounded-md border border-dashed border-border/60 text-center">
                  Loading recent activity…
                </div>
              ) : interactionsError ? (
                <div className="text-xs text-muted-foreground p-3 rounded-md border border-dashed border-border/60 text-center">
                  Recent activity is unavailable right now. Sign in again to see the latest interactions.
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 rounded-md border border-dashed border-border/60 text-center">
                  No recent activity yet. Interactions, report submissions, media uploads and role changes will appear here as they happen.
                </div>
              ) : recentActivity.map((a) => (

                <div key={a.id} className="flex items-start gap-3 py-1.5">
                  <Avatar initials={a.actorInitials} size={26} />
                  <div className="flex-1 min-w-0 text-sm">
                    <span className="font-medium">{a.actor}</span>{" "}
                    <span className="text-muted-foreground">{a.action}</span>{" "}
                    <span className="font-medium">{a.target}</span>
                    <div className="text-[11px] text-muted-foreground">{formatRelative(a.date)}</div>
                  </div>
                </div>
              ))}
            </div>

          </Card>
        </ErrorBoundary>


        <Card className="p-4">
          <SectionTitle>Status Distribution</SectionTitle>
          <div className="space-y-3">
            {stats.tierDistribution.map((t) => {
              const pct = Math.round((t.count / stats.totalGks) * 100);
              const color = t.tier === "Tier 1" ? "bg-warning" : t.tier === "Tier 2" ? "bg-info" : t.tier === "Tier 3" ? "bg-primary" : t.tier === "Academy" ? "bg-tier-3" : "bg-muted-foreground/40";
              return (
                <div key={t.tier}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="flex items-center gap-2"><TierBadge tier={t.tier as never} /> <span className="text-muted-foreground">{t.count} GKs</span></span>
                    <span className="tabular-nums font-mono font-medium">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-border">
            <Link to="/goalkeepers" className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-accent/40"><Users className="size-4 text-primary" /><span className="text-[11px]">Goalkeepers</span></Link>
            <Link to="/mentors" className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-accent/40"><UserCog className="size-4 text-info" /><span className="text-[11px]">Users & Roles</span></Link>
            <Link to="/reports" className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-accent/40"><FileText className="size-4 text-warning" /><span className="text-[11px]">Reports</span></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
