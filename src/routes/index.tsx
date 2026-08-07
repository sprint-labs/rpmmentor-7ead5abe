import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, StatCard, SectionTitle, TierBadge } from "@/components/primitives";
import {
  activity,
  alerts,
  goalkeepers,
  
  stats,
  formatRelative,
  getMentor,
  computeDutyOverview,
} from "@/lib/mock-data";
import { useDutySource, useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { ErrorBoundary } from "@/components/error-boundary";

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

import { ArrowUpRight, AlertTriangle, CalendarClock, FileText, Users, UserCog } from "lucide-react";
import { useAuth, ROLE_LABEL } from "@/lib/auth";
import { MentorDashboard } from "@/components/mentor/mentor-dashboard";
import { SyncStatusChip } from "@/components/sync-status-chip";
import { listMatchReports } from "@/lib/match-reports/reports.functions";

import { isDateOnlyInPeriod, lastNDaysPeriod } from "@/lib/dashboard-period";
import { getOverviewDashboardStats } from "@/lib/overview-dashboard.functions";
import { listCalendarEvents } from "@/lib/calendar.functions";

const OVERVIEW_PERIOD_DAYS = 14;

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listReports = useServerFn(listMatchReports);
  const {
    data: reportsData,
    isLoading: reportsLoading,
    isError: reportsError,
  } = useQuery({
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
  // Upcoming Logs reads the shared team calendar (same cache as /calendar).
  const fetchCalendarEvents = useServerFn(listCalendarEvents);
  const { data: teamEvents } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => fetchCalendarEvents(),
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

  // Upcoming interactions come from the shared team calendar only. There is
  // no sample/placeholder fallback — an empty schedule shows an empty state.
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = (teamEvents ?? [])
    .filter((e) => e.event_date >= todayIso)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 6);

  const greeting = `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={greeting}
        description={`${ROLE_LABEL[user.role]} view · overview of goalkeeper coverage and outstanding actions.`}
        action={<SyncStatusChip />}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Link
          to="/goalkeepers"
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
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
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
          aria-label="View overdue goalkeepers"
        >
          <StatCard
            label="Overdue Duty of Care"
            value={interactionsLoading ? "…" : interactionsError ? "—" : dutyOverview.overdue}
            hint={interactionsError ? "Count unavailable" : "Past tier cadence"}
            accent="warning"
            emptyMessage="All caught up"
          />
        </Link>
        <Link
          to="/reports"
          search={reportsSearch}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View match reports"
        >
          <StatCard
            label="Match Reports Submitted"
            value={
              reportsLoading ? "…" : reportsError || reportsInPeriod == null ? "—" : reportsInPeriod
            }
            hint={reportsError ? "Report count unavailable" : `Last ${OVERVIEW_PERIOD_DAYS} days`}
            accent="primary"
            emptyMessage="None submitted"
          />
        </Link>
        <Link
          to="/mentors"
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View users and roles"
        >
          <StatCard
            label="Active Mentors"
            value={overview?.activeMentors ?? "…"}
            hint="Accounts with mentor access"
          />
        </Link>
      </div>

      {/* Operational grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Duty of Care monitor */}
        <div className="col-span-12 lg:col-span-8 command-panel p-5 self-start">
          <SectionTitle
            action={
              <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-success shadow-[0_0_6px_var(--success)]" />
                  Nominal
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-warning shadow-[0_0_6px_var(--warning)]" />
                  Warning
                </span>
                <Link
                  to="/goalkeepers"
                  className="text-primary inline-flex items-center gap-1 normal-case tracking-normal"
                >
                  Goalkeepers <ArrowUpRight className="size-3" />
                </Link>
              </div>
            }
          >
            Duty of Care Monitor
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
            {(
              [
                {
                  level: "up_to_date",
                  label: "Up to date",
                  count: dutyOverview.up_to_date,
                  hint: "On cadence for tier",
                  bar: "bg-success",
                  value: "text-success",
                },
                {
                  level: "due_soon",
                  label: "Due soon",
                  count: dutyOverview.due_soon,
                  hint: "Approaching cadence",
                  bar: "bg-warning",
                  value: "text-warning",
                },
                {
                  level: "overdue",
                  label: "Overdue",
                  count: dutyOverview.overdue,
                  hint: "Past required cadence",
                  bar: "bg-warning",
                  value: "text-warning",
                },
                {
                  level: "not_required",
                  label: "Not required",
                  count: dutyOverview.not_required,
                  hint: "Tier 4 — no formal duty",
                  bar: "bg-muted-foreground/50",
                  value: "text-foreground",
                },
                {
                  level: "not_enough_data",
                  label: "Not enough data",
                  count: dutyOverview.not_enough_data,
                  hint: "Missing tier or interactions",
                  bar: "bg-muted-foreground/50",
                  value: "text-foreground",
                },
              ] as const
            ).map((b) => {
              const pct = Math.round((b.count / Math.max(1, dutyOverview.total)) * 100);
              return (
                <div key={b.level} className="space-y-2">
                  <div className="h-1.5 w-full bg-background overflow-hidden">
                    <div className={`h-full bar-grow ${b.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-baseline justify-between font-mono text-xs">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className={`tabular-nums font-bold ${b.value}`}>{b.count}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/70">
                    <span>{b.hint}</span>
                    <span className="font-mono tabular-nums">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status distribution */}
        <div className="col-span-12 lg:col-span-4 command-panel p-5">
          <SectionTitle>Distribution</SectionTitle>
          <div className="space-y-3">
            {stats.tierDistribution.map((t) => {
              const pct = Math.round((t.count / stats.totalGks) * 100);
              const color =
                t.tier === "Tier 1"
                  ? "bg-warning"
                  : t.tier === "Tier 2"
                    ? "bg-info"
                    : t.tier === "Tier 3"
                      ? "bg-primary"
                      : t.tier === "Academy"
                        ? "bg-tier-3"
                        : "bg-muted-foreground/40";
              return (
                <div key={t.tier} className="flex items-center gap-3">
                  <span className="w-20 shrink-0">
                    <TierBadge tier={t.tier as never} />
                  </span>
                  <div className="flex-1 h-1 bg-background overflow-hidden">
                    <div className={`h-full bar-grow ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-[11px] font-mono tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-border">
            <Link
              to="/goalkeepers"
              className="flex flex-col items-center gap-1 p-2 hover:bg-accent/40"
            >
              <Users className="size-4 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-wider">Keepers</span>
            </Link>
            <Link to="/mentors" className="flex flex-col items-center gap-1 p-2 hover:bg-accent/40">
              <UserCog className="size-4 text-info" />
              <span className="text-[10px] font-mono uppercase tracking-wider">Roles</span>
            </Link>
            <Link to="/reports" className="flex flex-col items-center gap-1 p-2 hover:bg-accent/40">
              <FileText className="size-4 text-warning" />
              <span className="text-[10px] font-mono uppercase tracking-wider">Reports</span>
            </Link>
          </div>
        </div>

        {/* Upcoming interactions */}
        <div className="col-span-12 lg:col-span-4 command-panel p-5">
          <SectionTitle
            action={
              <Link
                to="/calendar"
                className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1"
              >
                Calendar <ArrowUpRight className="size-3" />
              </Link>
            }
          >
            Upcoming Logs
          </SectionTitle>
          <div className="divide-y divide-border">
            {upcoming.length === 0 ? (
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 py-6 text-center">
                No scheduled interactions
              </div>
            ) : (
              upcoming.map((e) => {
                const gk = e.gkId ? goalkeepers.find((g) => g.id === e.gkId) : undefined;
                const m = e.mentorId ? getMentor(e.mentorId) : undefined;
                const content = (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono text-primary mb-1 uppercase tracking-widest">
                        {formatRelative(e.date)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{gk?.name ?? e.title}</span>
                        {gk ? <TierBadge tier={gk.tier} /> : null}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {gk ? `${gk.club} · ${gk.league}` : e.type}
                        {m ? ` · w/ ${m.name.split(" ")[1] ?? m.name}` : ""}
                      </div>
                    </div>
                    <CalendarClock className="size-3.5 text-muted-foreground/60 shrink-0" />
                  </>
                );
                return gk ? (
                  <Link
                    key={e.id}
                    to="/goalkeepers/$gkId"
                    params={{ gkId: gk.id }}
                    className="flex items-start gap-3 py-3 hover:bg-accent/30 -mx-2 px-2 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={e.id} className="flex items-start gap-3 py-3 -mx-2 px-2">
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent activity */}
        <ErrorBoundary
          fallback={(reset) => (
            <div className="col-span-12 lg:col-span-4 command-panel p-5">
              <SectionTitle>Recent Events</SectionTitle>
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Recent activity unavailable</p>
                  <p className="text-destructive/80">
                    Something went wrong loading the latest interactions.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="mt-3 inline-flex h-8 items-center justify-center bg-destructive px-3 text-[10px] font-mono uppercase tracking-widest text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Retry
              </button>
            </div>
          )}
        >
          <div className="col-span-12 lg:col-span-4 command-panel p-5">
            <SectionTitle>Recent Events</SectionTitle>
            <div className="space-y-3">
              {interactionsLoading ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 py-6 text-center">
                  Loading…
                </div>
              ) : interactionsError ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 py-6 text-center">
                  Activity unavailable
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 py-6 text-center">
                  No recent events
                </div>
              ) : (
                recentActivity.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-xs">
                    <div className="w-0.5 self-stretch min-h-8 bg-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-muted-foreground leading-snug">
                        <span className="text-foreground font-semibold">{a.actor}</span> {a.action}{" "}
                        <span className="text-foreground font-semibold">{a.target}</span>
                      </p>
                      <span className="text-[10px] text-muted-foreground/70 font-mono">
                        {formatRelative(a.date)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </ErrorBoundary>

        {/* Alerts */}
        <div className="col-span-12 lg:col-span-4 command-panel p-5">
          <SectionTitle
            action={
              <Link
                to="/alerts"
                className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1"
              >
                All <ArrowUpRight className="size-3" />
              </Link>
            }
          >
            System Alerts
          </SectionTitle>
          <div className="space-y-2">
            {alerts.length === 0 ? (
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 py-6 text-center">
                No active alerts
              </div>
            ) : (
              alerts.slice(0, 6).map((a) => {
                const tone =
                  a.severity === "high"
                    ? "border-destructive/30 bg-destructive/5 text-destructive"
                    : a.severity === "medium"
                      ? "border-warning/30 bg-warning/5 text-warning"
                      : "border-info/30 bg-info/5 text-info";
                return (
                  <div key={a.id} className={`border p-3 ${tone}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
                        {a.kind}
                      </span>
                      <AlertTriangle className="size-3" />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{a.message}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
