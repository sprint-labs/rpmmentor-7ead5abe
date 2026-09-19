import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, StatCard, SectionTitle, TierBadge } from "@/components/primitives";
import { alerts, formatRelative, type Alert } from "@/lib/mock-data";
import { compareAlertSeverity } from "@/lib/interaction-alert-rank";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
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

import { ArrowUpRight, AlertTriangle, CalendarClock, FileText, Plus } from "lucide-react";
import { useAuth, ROLE_LABEL } from "@/lib/auth";
import { MentorDashboard } from "@/components/mentor/mentor-dashboard";
import { SyncStatusChip } from "@/components/sync-status-chip";
import { listMatchReports } from "@/lib/match-reports/reports.functions";

import { isDateOnlyInPeriod, lastNDaysPeriod } from "@/lib/dashboard-period";
import { getOverviewDashboardStats } from "@/lib/overview-dashboard.functions";
import { getRosterSnapshot } from "@/lib/roster-snapshot.functions";
import { listPlayers } from "@/lib/players.functions";
import { goalkeeperByName } from "@/lib/roster/goalkeeper-profile";
import { GoalkeeperDistribution, MIN_VISIBLE_BAR } from "@/components/goalkeeper-distribution";
import { wholePercentsSummingTo100 } from "@/lib/roster-snapshot";
import { listCalendarEvents } from "@/lib/calendar.functions";
import { listPlayerDutyOfCare } from "@/lib/duty-of-care.functions";
import { countDutyRows } from "@/lib/duty-of-care-roster";
import { BulletinDashboardCard } from "@/components/bulletins/dashboard-card";

const OVERVIEW_PERIOD_DAYS = 14;

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);

  /**
   * Opens the calendar's add-event form with the alert's wording carried over.
   * A follow-up now has to name the goalkeeper and the attending mentor, and
   * neither can be derived from an alert: its goalkeeper reference cannot be
   * resolved to a canonical roster id without matching on names, and an alert
   * says nothing about who should attend. So the manager confirms both.
   */
  function escalateAlert(a: Alert) {
    navigate({
      to: "/calendar",
      search: { new: true, title: `Escalation: ${a.kind}`, notes: a.message },
    });
  }

  const listReports = useServerFn(listMatchReports);
  const {
    data: reportsData,
    isLoading: reportsLoading,
    isError: reportsError,
  } = useQuery({
    // Share the Reports page cache so the dashboard number and the
    // destination list are based on the same canonical Supabase read.
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
  const { data: overview, isError: overviewError } = useQuery({
    queryKey: ["overview-dashboard-stats", period.fromDate, period.toDate],
    queryFn: () => fetchOverview({ data: { fromDate: period.fromDate, toDate: period.toDate } }),
    enabled: Boolean(user && user.role !== "mentor"),
    staleTime: 30_000,
  });
  // Roster Snapshot counts come from public.players, so an unreachable
  // database reports itself instead of leaving stale numbers on screen.
  const fetchRosterSnapshot = useServerFn(getRosterSnapshot);
  const {
    data: roster,
    isPending: rosterPending,
    isError: rosterError,
  } = useQuery({
    queryKey: ["roster-snapshot"],
    queryFn: () => fetchRosterSnapshot(),
    enabled: Boolean(user && user.role !== "mentor"),
    staleTime: 30_000,
  });
  // The roster rows themselves, for resolving a calendar event's goalkeeper
  // name to a profile. Shares the key `/goalkeepers` and every profile page
  // already use, so this is a cache read rather than a second fetch.
  const listPlayersFn = useServerFn(listPlayers);
  const { data: rosterRows } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => listPlayersFn(),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
  });

  // Duty of Care comes from `public.player_duty_of_care` — the `duty_of_care_at()`
  // projection — so this headline, the roster chips and each profile badge are
  // three views of one answer. It used to be recomputed here from logged
  // interactions keyed by legacy slug, which quietly undercounted: the card
  // said 10 while the roster said 15.
  const dutyListFn = useServerFn(listPlayerDutyOfCare);
  const {
    data: dutyRows,
    isPending: dutyPending,
    isError: dutyUnavailable,
  } = useQuery({
    queryKey: ["duty-of-care", "roster"],
    queryFn: () => dutyListFn(),
    enabled: Boolean(user && user.role !== "mentor"),
    staleTime: 60_000,
  });

  // Upcoming Events reads the shared team calendar (same cache as /calendar).
  const fetchCalendarEvents = useServerFn(listCalendarEvents);
  const {
    data: teamEvents,
    isPending: calendarPending,
    isError: calendarError,
  } = useQuery({
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

  useEffect(() => {
    const refreshReports = () => {
      void queryClient.invalidateQueries({ queryKey: ["match-reports"] });
    };
    window.addEventListener("rpm:report-submitted", refreshReports);
    return () => window.removeEventListener("rpm:report-submitted", refreshReports);
  }, [queryClient]);

  // Hooks must run unconditionally — this query stays above every early return
  // and is disabled unless a signed-in, non-mentor user is viewing the page.
  const {
    data: loggedInteractions,
    isPending: interactionsPending,
    isError: interactionsError,
  } = useLoggedInteractions(Boolean(user) && user?.role !== "mentor");
  // Show only durable interactions here; sample activity must never be mixed
  // into a live operational dashboard.
  const recentActivity = useMemo(
    () =>
      (loggedInteractions ?? [])
        .map((i) => ({
          id: `interaction-${i.id}`,
          actor: i.mentorName || "Mentor",
          actorInitials: initialsOf(i.mentorName || "Mentor"),
          action: `logged a ${i.interactionType.toLowerCase()} with`,
          target: i.goalkeeperName,
          gkId: i.gkSlug,
          date: i.occurredAt,
        }))
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 8),
    [loggedInteractions],
  );

  if (!user) return null;

  // Dedicated mentor experience — only the stat cards shown below are mentor-specific.
  if (user.role === "mentor") {
    return <MentorDashboard user={user} mentorProfileId={user.mentorId ?? ""} />;
  }

  const canViewSystemAlerts = can("alerts.view");
  const dutyOverview = countDutyRows(dutyRows);
  // The five duty bands are mutually exclusive and cover the whole roster, so
  // this is a distribution and has to total 100%. Rounding each band on its own
  // does not: 116 goalkeepers split 39/32/15/28/2 round to
  // 34 + 28 + 13 + 24 + 2 = 101%. Largest remainder, same as the Goalkeeper
  // Distribution panel, so the column totals what a distribution claims.
  const dutyBandCounts = [
    dutyOverview.up_to_date,
    dutyOverview.due_soon,
    dutyOverview.overdue,
    dutyOverview.not_required,
    dutyOverview.not_enough_data,
  ];
  const dutyBandPercents = wholePercentsSummingTo100(dutyBandCounts);
  const dutyBands = (
    [
      {
        level: "up_to_date",
        label: "Up to date",
        hint: "On cadence for tier",
        bar: "bg-success",
        value: "text-success",
      },
      {
        level: "due_soon",
        label: "Due soon",
        hint: "Approaching cadence",
        bar: "bg-warning",
        value: "text-warning",
      },
      {
        level: "overdue",
        label: "Overdue",
        hint: "Past required cadence",
        bar: "bg-warning",
        value: "text-warning",
      },
      {
        level: "not_required",
        label: "Not required",
        hint: "Tier 4 — no formal duty",
        bar: "bg-muted-foreground/50",
        value: "text-foreground",
      },
      {
        level: "not_enough_data",
        label: "Not enough data",
        hint: "Missing tier or interactions",
        bar: "bg-muted-foreground/50",
        value: "text-foreground",
      },
    ] as const
  ).map((band, index) => ({
    ...band,
    count: dutyBandCounts[index],
    pct: dutyBandPercents[index],
    // A band with someone in it always draws something. One of 116 is 1% of
    // the track, which is no visible pixels at all.
    barWidth: dutyBandCounts[index] === 0 ? 0 : Math.max(MIN_VISIBLE_BAR, dutyBandPercents[index]),
  }));

  // Upcoming interactions come from the shared team calendar only. There is
  // no sample/placeholder fallback — an empty schedule shows an empty state.
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = (teamEvents ?? [])
    .filter((e) => e.event_date >= todayIso && e.status !== "cancelled")
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 6);

  const greeting = `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={greeting}
        titleClassName="break-words text-2xl leading-tight min-[390px]:text-[1.625rem] sm:text-3xl"
        description={`${ROLE_LABEL[user.role]} view · overview of goalkeeper coverage and outstanding actions.`}
        action={
          <div className="grid w-full grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <SyncStatusChip className="w-fit justify-self-start whitespace-nowrap min-[390px]:col-span-2 sm:col-auto" />
            {can("reports.submit") && (
              <button
                onClick={() => setWorkflow("report")}
                className="inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-2 text-center text-[11px] font-semibold uppercase leading-tight tracking-[0.06em] text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3 sm:text-xs"
              >
                <FileText className="size-4 shrink-0" />
                Submit report
              </button>
            )}
            {can("interactions.log") && (
              <button
                onClick={() => setWorkflow("interaction")}
                className="inline-flex min-h-11 min-w-0 w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-2 text-center text-[11px] font-semibold uppercase leading-tight tracking-[0.06em] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-auto sm:px-3 sm:text-xs"
              >
                <Plus className="size-4 shrink-0" />
                Log interaction
              </button>
            )}
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-5 [&>a]:h-full [&>a]:min-w-0 [&>a>div]:h-full">
        <Link
          to="/goalkeepers"
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="sr-only">View all goalkeepers: </span>
          <StatCard
            label="Total Goalkeepers"
            value={overviewError ? "—" : (overview?.totalGoalkeepers ?? "…")}
            hint={overviewError ? "Count unavailable" : "Player records on file"}
          />
        </Link>
        <Link
          to="/insights/$metric"
          params={{ metric: "interactions" }}
          search={{ from: period.fromDate, to: period.toDate, level: "", tier: "" }}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
        >
          <span className="sr-only">Break down: </span>
          <StatCard
            label="Interactions Logged"
            value={overviewError ? "—" : (overview?.interactionsInPeriod ?? "…")}
            hint={
              overviewError
                ? "Count unavailable"
                : `Last ${OVERVIEW_PERIOD_DAYS} days · by interaction date`
            }
            accent="info"
            emptyMessage="None logged"
          />
        </Link>
        <Link
          to="/insights/$metric"
          params={{ metric: "duty" }}
          search={{ from: period.fromDate, to: period.toDate, level: "overdue", tier: "" }}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        >
          <span className="sr-only">Break down: </span>
          <StatCard
            label="Duty of Care"
            value={dutyPending ? "…" : dutyUnavailable ? "—" : dutyOverview.overdue}
            hint={
              dutyUnavailable
                ? "Count unavailable"
                : dutyOverview.overdue > 0
                  ? `Goalkeepers past required cadence · of ${dutyOverview.total}`
                  : "Nothing overdue"
            }
            accent="warning"
            emptyMessage="Nothing overdue"
          />
        </Link>
        <Link
          to="/insights/$metric"
          params={{ metric: "reports" }}
          search={{ from: period.fromDate, to: period.toDate, level: "", tier: "" }}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="sr-only">Break down: </span>
          <StatCard
            label="Match Reports"
            value={
              reportsLoading ? "…" : reportsError || reportsInPeriod == null ? "—" : reportsInPeriod
            }
            hint={
              reportsError
                ? "Count unavailable"
                : `Last ${OVERVIEW_PERIOD_DAYS} days · by match date`
            }
            accent="primary"
            emptyMessage="None in period"
          />
        </Link>
        <Link
          to="/insights/$metric"
          params={{ metric: "mentors" }}
          search={{ from: period.fromDate, to: period.toDate, level: "", tier: "" }}
          className="block min-[390px]:col-span-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:col-span-1"
        >
          <span className="sr-only">Break down: </span>
          <StatCard
            label="Active Mentors"
            value={overviewError ? "—" : (overview?.activeMentors ?? "…")}
            hint={overviewError ? "Count unavailable" : "Mentors and mentor managers"}
          />
        </Link>
      </div>

      <BulletinDashboardCard scope="team" />

      {/* Operational grid */}
      <div className="grid grid-cols-12 gap-4">
        {/* Duty of Care monitor */}
        <div className="col-span-12 self-start command-panel p-4 sm:p-5 lg:col-span-8">
          <SectionTitle
            className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3"
            action={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
                <Link
                  to="/goalkeepers"
                  className="text-primary inline-flex items-center gap-1 normal-case tracking-normal"
                >
                  Goalkeepers <ArrowUpRight className="size-3" />
                </Link>
              </div>
            }
          >
            Duty of Care Monitor · Reference
          </SectionTitle>
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            Reference tier roster combined with live logged interactions.
          </p>
          {/* Gated on the duty read, which is where every number below comes
              from. Gating on the interactions read instead drew five bands of
              "0" while the card above this one still said "…". */}
          {dutyPending ? (
            <p className="text-sm text-muted-foreground">Loading duty-of-care figures…</p>
          ) : dutyUnavailable ? (
            <p className="text-sm text-muted-foreground">Duty-of-care figures didn't load.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
              {dutyBands.map((b) => (
                <Link
                  key={b.level}
                  to="/insights/$metric"
                  params={{ metric: "duty" }}
                  search={{ from: period.fromDate, to: period.toDate, level: b.level, tier: "" }}
                  className="space-y-2 block -mx-2 px-2 py-1 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {/* Named by its own content. An aria-label that paraphrases
                      the band reads as a different string from the one on
                      screen, which breaks voice control — the visible words
                      have to be part of the name. */}
                  <span className="sr-only">View goalkeepers: </span>
                  <div className="h-1.5 w-full bg-background overflow-hidden">
                    <div
                      className={`h-full bar-grow ${b.bar}`}
                      style={{ width: `${b.barWidth}%` }}
                    />
                  </div>
                  <div className="flex items-baseline justify-between font-mono text-xs">
                    <span className="text-muted-foreground">{b.label}</span>
                    <span className={`tabular-nums font-bold ${b.value}`}>{b.count}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{b.hint}</span>
                    <span className="font-mono tabular-nums">{b.pct}%</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <GoalkeeperDistribution roster={roster} pending={rosterPending} error={rosterError} />

        {/* Upcoming interactions */}
        <div className="col-span-12 lg:col-span-4 command-panel p-5">
          <SectionTitle
            action={
              <span className="inline-flex items-center gap-3">
                {can("calendar.manage") && (
                  <Link
                    to="/calendar"
                    search={{ gkId: "", new: true }}
                    className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <Plus className="size-3" /> New event
                  </Link>
                )}
                <Link
                  to="/insights/$metric"
                  params={{ metric: "events" }}
                  search={{ from: period.fromDate, to: period.toDate, level: "", tier: "" }}
                  className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1"
                >
                  All events <ArrowUpRight className="size-3" />
                </Link>
              </span>
            }
          >
            Upcoming Events
          </SectionTitle>
          <div className="divide-y divide-border">
            {calendarPending ? (
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                Loading calendar…
              </div>
            ) : calendarError ? (
              <div className="space-y-2 py-6 text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Calendar didn't load
                </div>
                <Link
                  to="/calendar"
                  search={{ gkId: "", new: false }}
                  className="text-[10px] font-mono uppercase tracking-widest text-primary hover:underline"
                >
                  Open calendar
                </Link>
              </div>
            ) : upcoming.length === 0 ? (
              <div className="space-y-2 py-6 text-center">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Nothing scheduled
                </div>
                <p className="text-[11px] text-muted-foreground px-2">
                  This reads the shared team calendar. Schedule a visit or catch-up to fill it.
                </p>
                {can("calendar.manage") ? (
                  <Link
                    to="/calendar"
                    search={{ gkId: "", new: true }}
                    className="text-[10px] font-mono uppercase tracking-widest text-primary hover:underline"
                  >
                    Schedule an event
                  </Link>
                ) : (
                  <Link
                    to="/calendar"
                    search={{ gkId: "", new: false }}
                    className="text-[10px] font-mono uppercase tracking-widest text-primary hover:underline"
                  >
                    View calendar
                  </Link>
                )}
              </div>
            ) : (
              upcoming.map((e) => {
                // Resolved against the live roster, so an event for a
                // goalkeeper signed since the seed was captured still links to
                // their profile and still shows their real tier.
                const gk = e.goalkeeper_name
                  ? goalkeeperByName(e.goalkeeper_name, rosterRows)
                  : null;
                const content = (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono text-primary mb-1 uppercase tracking-widest">
                        {formatRelative(e.event_date)}
                        {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium truncate">{e.title}</span>
                        {gk ? <TierBadge tier={gk.tier} /> : null}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {e.event_type}
                        {e.goalkeeper_name ? ` · ${e.goalkeeper_name}` : ""}
                        {e.location ? ` · ${e.location}` : ""}
                      </div>
                    </div>
                    <CalendarClock className="size-3.5 text-muted-foreground shrink-0" />
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
            <div
              className={`col-span-12 ${canViewSystemAlerts ? "lg:col-span-4" : "lg:col-span-8"} command-panel p-5`}
            >
              <SectionTitle>Recent Logged Interactions</SectionTitle>
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Recent interactions didn't load</p>
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
          <div
            className={`col-span-12 ${canViewSystemAlerts ? "lg:col-span-4" : "lg:col-span-8"} command-panel p-5`}
          >
            <SectionTitle
              action={
                can("interactions.log") ? (
                  <button
                    type="button"
                    onClick={() => setWorkflow("interaction")}
                    className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <Plus className="size-3" /> Log interaction
                  </button>
                ) : undefined
              }
            >
              Recent Logged Interactions
            </SectionTitle>
            <div className="space-y-3">
              {interactionsPending ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                  Loading interactions…
                </div>
              ) : interactionsError ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                  Interactions didn't load
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                  No interactions logged recently
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
                      <span className="text-[10px] text-muted-foreground font-mono">
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
        {canViewSystemAlerts && (
          <div className="col-span-12 lg:col-span-4 command-panel p-5">
            <SectionTitle
              action={
                <Link
                  to="/insights/$metric"
                  params={{ metric: "alerts" }}
                  search={{ from: period.fromDate, to: period.toDate, level: "", tier: "" }}
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
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                  Live alert feed not connected
                </div>
              ) : (
                [...alerts]
                  .sort(compareAlertSeverity)
                  .slice(0, 6)
                  .map((a) => {
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
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {a.message}
                        </p>
                        {can("calendar.manage") && (
                          <button
                            type="button"
                            onClick={() => escalateAlert(a)}
                            className="mt-2 inline-flex items-center gap-1 border border-current/40 px-2 py-1 text-[10px] font-mono uppercase tracking-widest hover:bg-current/10"
                          >
                            <ArrowUpRight className="size-3" />
                            Escalate
                          </button>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}
      </div>

      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} />
    </div>
  );
}
