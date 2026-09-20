import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader, StatCard, SectionTitle, TierBadge } from "@/components/primitives";
// Helpers only — no seeded roster or activity data reaches this page.
import { formatRelative } from "@/lib/mock-data";
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
import { DataFreshnessChip } from "@/components/data-freshness-chip";
import { CalendarMonthCard } from "@/components/calendar/month-card";
import { describeDataFreshness } from "@/lib/data-freshness";
import { localDateIso } from "@/lib/calendar/month";
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

/** The two feeds behind Recent Activity, in tab order. */
const ACTIVITY_FEEDS = [
  { id: "interactions", label: "Interactions" },
  { id: "reports", label: "Match Reports" },
] as const;

/** One entry in either feed, reduced to what the row actually prints. */
interface ActivityEntry {
  id: string;
  actor: string;
  actorNamed: boolean;
  action: string;
  target: string;
  date: string;
}

/**
 * A line in Recent Activity.
 *
 * Both feeds render through this so an interaction and a report cannot drift
 * into describing themselves differently; only the rail colour separates them.
 * An unnamed actor stays italic and muted, because "A mentor" is a placeholder
 * standing in for a missing profile name, not somebody's name.
 */
function ActivityRow({ entry, tone }: { entry: ActivityEntry; tone: string }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <div className={`w-0.5 self-stretch min-h-8 shrink-0 ${tone}`} />
      <div className="flex-1 min-w-0">
        <p className="text-muted-foreground leading-snug">
          <span
            className={
              entry.actorNamed ? "text-foreground font-semibold" : "italic text-muted-foreground"
            }
          >
            {entry.actor}
          </span>{" "}
          {entry.action} <span className="text-foreground font-semibold">{entry.target}</span>
        </p>
        <span className="text-[10px] text-muted-foreground font-mono">
          {formatRelative(entry.date)}
        </span>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  /** Which feed the Recent Activity panel is showing. */
  const [activityFeed, setActivityFeed] = useState<"interactions" | "reports">("interactions");
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);

  const listReports = useServerFn(listMatchReports);
  const {
    data: reportsData,
    isLoading: reportsLoading,
    isError: reportsError,
    dataUpdatedAt: reportsFetchedAt,
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
  const {
    data: overview,
    isError: overviewError,
    dataUpdatedAt: overviewFetchedAt,
  } = useQuery({
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
    dataUpdatedAt: rosterFetchedAt,
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
    dataUpdatedAt: dutyFetchedAt,
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
    dataUpdatedAt: calendarFetchedAt,
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
    dataUpdatedAt: interactionsFetchedAt,
  } = useLoggedInteractions(Boolean(user) && user?.role !== "mentor");
  // Show only durable interactions here; sample activity must never be mixed
  // into a live operational dashboard.
  const recentActivity = useMemo(
    () =>
      (loggedInteractions ?? [])
        .map((i) => {
          const name = (i.mentorName ?? "").trim();
          // An email address is not a display name. When a profile carries no
          // name, say so plainly rather than rendering the word "Mentor", or a
          // login address, in the styling a real person's name gets.
          const named = name.length > 0 && !name.includes("@");
          return {
            id: `interaction-${i.id}`,
            actor: named ? name : "A mentor",
            actorNamed: named,
            actorInitials: named ? initialsOf(name) : "?",
            action: `logged a ${i.interactionType.toLowerCase()} with`,
            target: i.goalkeeperName,
            gkId: i.gkSlug,
            // Ordered and stamped by when it was LOGGED, which is what this
            // panel is titled. Ordering by when the interaction happened meant
            // a catch-up entered this morning about last week could be pushed
            // off the list on the very day it was entered.
            date: i.createdAt || i.occurredAt,
          };
        })
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 8),
    [loggedInteractions],
  );

  /**
   * The same feed, told from the Match Reports side.
   *
   * It reads the `["match-reports"]` cache this page already loads for the KPI
   * card, so switching the toggle costs no request and can never show a
   * different set of reports from the number above it.
   *
   * Ordered by match date. A report has no logged-at stamp of its own in this
   * shape, and the date on it is the fixture's — which is the date a reader
   * means when they ask what was reported on recently.
   */
  const recentReports = useMemo(
    () =>
      (reportsData?.reports ?? [])
        .map((r) => {
          const coach = (r.coach ?? "").trim();
          const named = coach.length > 0 && !coach.includes("@");
          const opponent = (r.opponent ?? "").trim();
          return {
            id: `report-${r.report_id}`,
            actor: named ? coach : "A coach",
            actorNamed: named,
            action: opponent ? `reported on a match against ${opponent} for` : "reported on",
            target: r.goalkeeper,
            date: r.match_date ?? "",
          };
        })
        .filter((r) => r.date)
        .sort((a, b) => +new Date(b.date) - +new Date(a.date))
        .slice(0, 8),
    [reportsData],
  );

  if (!user) return null;

  // Dedicated mentor experience — only the stat cards shown below are mentor-specific.
  if (user.role === "mentor") {
    return <MentorDashboard user={user} mentorProfileId={user.mentorId ?? ""} />;
  }

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
        // Not only Tier 4: goalkeepers with no tier recorded land here too, and
        // "Tier 4" told a manager they had no formal duty for someone who is
        // simply untiered — which this same page flags for assignment. Verified
        // against live data: 15 Tier 4 plus 2 with no tier.
        hint: "Tier 4 or no tier recorded",
        bar: "bg-muted-foreground/50",
        value: "text-foreground",
      },
      {
        level: "not_enough_data",
        label: "Never contacted",
        // Not a missing tier — an untiered goalkeeper is counted as "Not
        // required" above. Verified against live data: every goalkeeper in this
        // band holds Tier 1 or Tier 2 and none has any qualifying contact on
        // record. That is a gap to close, not an absence of information.
        hint: "Tiered, no qualifying contact recorded",
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
  // Local calendar date, not `toISOString()`. The ISO form is UTC, so between
  // midnight and 01:00 BST it still reads as yesterday and today's fixtures
  // reappear in this list under a "Yesterday" label — worse still for a viewer
  // in a timezone behind UTC.
  const todayIso = localDateIso(new Date());
  const upcomingAll = (teamEvents ?? [])
    .filter((e) => e.event_date >= todayIso && e.status !== "cancelled")
    .sort(
      (a, b) =>
        a.event_date.localeCompare(b.event_date) ||
        (a.start_time ?? "").localeCompare(b.start_time ?? ""),
    );
  const UPCOMING_SHOWN = 6;
  const upcoming = upcomingAll.slice(0, UPCOMING_SHOWN);

  /**
   * When this screen's figures were last read from the database.
   *
   * Every panel's fetch time is included, so the label is bounded by the most
   * stale of them. The outbound sync queue is deliberately not consulted: it
   * measures whether this device has finished uploading its own work, which
   * says nothing about whether the numbers here are current.
   */
  const freshness = describeDataFreshness({
    fetchedAt: [
      reportsFetchedAt,
      overviewFetchedAt,
      rosterFetchedAt,
      dutyFetchedAt,
      calendarFetchedAt,
      interactionsFetchedAt,
    ],
    anyError:
      reportsError ||
      overviewError ||
      rosterError ||
      dutyUnavailable ||
      calendarError ||
      interactionsError,
    reportsSyncedAt: overview?.reportsSyncedAt ?? null,
  });

  const greeting = `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`;

  return (
    // `pt-2` is the half-line of air the header was missing: the greeting sat
    // hard against the app bar above it.
    <div className="space-y-4 pt-2">
      <PageHeader
        title={greeting}
        titleClassName="break-words text-2xl leading-tight min-[390px]:text-[1.625rem] sm:text-3xl"
        description={`${ROLE_LABEL[user.role]} view · overview of goalkeeper coverage and outstanding actions.`}
        action={
          <div className="grid w-full grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            {/* Two different questions, so two indicators:
                  - freshness: are the figures on this page current?
                  - SyncStatusChip: has MY unsent work finished uploading?
                The chip used to answer the second while being read as the
                first, falling back to a hardcoded "Up to date" whenever the
                queue was empty — which is its normal state. */}
            <DataFreshnessChip
              freshness={freshness}
              className="w-fit justify-self-start whitespace-nowrap min-[390px]:col-span-2 sm:col-auto"
            />
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
          className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
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
          className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
        >
          <span className="sr-only">Break down: </span>
          <StatCard
            label="Duty of Care"
            value={dutyPending ? "…" : dutyUnavailable ? "—" : dutyOverview.overdue}
            hint={
              // "Nothing overdue" is an all-clear on a safeguarding metric, so
              // it must never appear before the roster has actually been read.
              // While loading the count is 0, which fell straight through to
              // that reassurance.
              dutyPending
                ? "Checking the roster…"
                : dutyUnavailable
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
          className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
          className="group block min-[390px]:col-span-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:col-span-1"
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
        <div className="col-span-12 self-start command-panel p-4 sm:p-5 lg:col-span-4">
          <SectionTitle
            className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3"
            action={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground">
                <Link
                  to="/goalkeepers"
                  className="text-primary-ink inline-flex items-center gap-1 normal-case tracking-normal"
                >
                  Goalkeepers <ArrowUpRight className="size-3" />
                </Link>
              </div>
            }
          >
            Duty of Care
          </SectionTitle>
          {/* The title said "· Reference" and the subtitle described the
              client-side calculation that combined a seed roster with logged
              interactions. That calculation was removed when this moved to
              `public.player_duty_of_care`; the wording stayed behind, telling
              a manager to distrust the one canonical number on the page. */}
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
            {dutyPending || dutyUnavailable
              ? "Live cadence status from the goalkeeper roster."
              : `Live cadence status for all ${dutyOverview.total} goalkeepers. Percentages are of that roster.`}
          </p>
          {/* Gated on the duty read, which is where every number below comes
              from. Gating on the interactions read instead drew five bands of
              "0" while the card above this one still said "…". */}
          {dutyPending ? (
            <p className="text-sm text-muted-foreground">Loading duty-of-care figures…</p>
          ) : dutyUnavailable ? (
            <p className="text-sm text-muted-foreground">Duty-of-care figures didn't load.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-4">
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

        {/* Recent activity */}
        <ErrorBoundary
          fallback={(reset) => (
            <div className="col-span-12 self-start lg:col-span-8 command-panel p-5">
              <SectionTitle>Recent Activity</SectionTitle>
              <div className="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Recent activity didn't load</p>
                  <p className="text-destructive/80">
                    Something went wrong loading the latest activity.
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
          <div className="col-span-12 self-start lg:col-span-8 command-panel p-5">
            <SectionTitle
              action={
                can("interactions.log") ? (
                  <button
                    type="button"
                    onClick={() => setWorkflow("interaction")}
                    className="text-[10px] font-mono uppercase tracking-widest text-primary-ink inline-flex items-center gap-1 hover:underline"
                  >
                    <Plus className="size-3" /> Log interaction
                  </button>
                ) : undefined
              }
            >
              Recent Activity
            </SectionTitle>

            {/* Two feeds over one panel. A tablist rather than two links: this
                swaps what the panel shows without leaving the dashboard, and
                both feeds read caches the page has already loaded. */}
            <div
              role="tablist"
              aria-label="Recent activity feed"
              className="mb-4 inline-flex gap-1 rounded-md border border-border p-0.5"
            >
              {ACTIVITY_FEEDS.map((feed) => {
                const selected = activityFeed === feed.id;
                return (
                  <button
                    key={feed.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActivityFeed(feed.id)}
                    className={`min-h-8 rounded px-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      selected
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {feed.label}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {activityFeed === "interactions" ? (
                interactionsPending ? (
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
                  recentActivity.map((a) => <ActivityRow key={a.id} entry={a} tone="bg-info" />)
                )
              ) : reportsLoading ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                  Loading match reports…
                </div>
              ) : reportsError ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                  Match reports didn't load
                </div>
              ) : recentReports.length === 0 ? (
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground py-6 text-center">
                  No match reports submitted recently
                </div>
              ) : (
                recentReports.map((a) => <ActivityRow key={a.id} entry={a} tone="bg-primary" />)
              )}
            </div>
          </div>
        </ErrorBoundary>

        {/* Calendar and the fixtures in it, as one cell. */}
        <div className="col-span-12 grid gap-4 self-start lg:col-span-8 xl:grid-cols-2">
          {/* Month calendar, kept at the width it had as a quarter-width card;
              the wider cell goes to the fixtures list beside it rather than to
              a stretched grid. */}
          <CalendarMonthCard
            className="self-start"
            events={teamEvents}
            interactions={loggedInteractions}
            pending={calendarPending}
            error={calendarError}
            today={todayIso}
          />

          {/* Upcoming fixtures, beside the month they fall in. Both read the
              same `["calendar-events"]` cache, so a date on the grid and a
              row in this list can never disagree. */}
          <div className="command-panel self-start p-5">
            <SectionTitle
              action={
                <span className="inline-flex items-center gap-3">
                  {can("calendar.manage") && (
                    <Link
                      to="/calendar"
                      search={{ gkId: "", new: true }}
                      className="text-[10px] font-mono uppercase tracking-widest text-primary-ink inline-flex items-center gap-1 hover:underline"
                    >
                      <Plus className="size-3" /> New event
                    </Link>
                  )}
                  <Link
                    to="/insights/$metric"
                    params={{ metric: "events" }}
                    search={{ from: period.fromDate, to: period.toDate, level: "", tier: "" }}
                    className="text-[10px] font-mono uppercase tracking-widest text-primary-ink inline-flex items-center gap-1"
                  >
                    All events <ArrowUpRight className="size-3" />
                  </Link>
                </span>
              }
            >
              Upcoming Fixtures
            </SectionTitle>
            {/* An undisclosed cap on a list like this reads as "there are only
                six". Live data regularly has several times that in the next week
                alone, so the count says what is being withheld. */}
            {!calendarPending && !calendarError && upcomingAll.length > upcoming.length ? (
              <p className="-mt-2 mb-2 text-[10px] text-muted-foreground">
                Showing the next {upcoming.length} of {upcomingAll.length} scheduled.
              </p>
            ) : null}
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
                    className="text-[10px] font-mono uppercase tracking-widest text-primary-ink hover:underline"
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
                      className="text-[10px] font-mono uppercase tracking-widest text-primary-ink hover:underline"
                    >
                      Schedule an event
                    </Link>
                  ) : (
                    <Link
                      to="/calendar"
                      search={{ gkId: "", new: false }}
                      className="text-[10px] font-mono uppercase tracking-widest text-primary-ink hover:underline"
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
                        <div className="text-[10px] font-mono text-primary-ink mb-1 uppercase tracking-widest">
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
        </div>

        <GoalkeeperDistribution roster={roster} pending={rosterPending} error={rosterError} />
      </div>

      <WorkflowDialog kind={workflow} onClose={() => setWorkflow(null)} />
    </div>
  );
}
