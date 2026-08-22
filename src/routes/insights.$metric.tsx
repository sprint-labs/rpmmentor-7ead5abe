import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, CalendarClock, AlertTriangle } from "lucide-react";
import { PageHeader, SectionTitle, TierBadge } from "@/components/primitives";
import { useAuth } from "@/lib/auth";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { listPlayers } from "@/lib/players.functions";
import { listUsersAndRoles } from "@/lib/users-and-roles.functions";
import { listMatchReports } from "@/lib/match-reports/reports.functions";
import { listAssignableMentors, listCalendarEvents } from "@/lib/calendar.functions";
import {
  alerts as systemAlerts,
  goalkeepers,
  dutyStatusForGk,
  formatRelative,
  type DutyLevel,
} from "@/lib/mock-data";
import { isDateOnlyInPeriod, lastNDaysPeriod } from "@/lib/dashboard-period";
import { isDashboardInteractionType } from "@/lib/interactions/schema";
import { buildActiveMentorInsightRows } from "@/lib/active-mentor-insights";
import { RequirePermission } from "@/components/require-permission";

const METRICS = [
  "goalkeepers",
  "interactions",
  "duty",
  "reports",
  "mentors",
  "events",
  "alerts",
] as const;
type Metric = (typeof METRICS)[number];

const META: Record<Metric, { title: string; description: string; to: string; linkLabel: string }> =
  {
    goalkeepers: {
      title: "Total Goalkeepers",
      description: "Every canonical player record on file.",
      to: "/goalkeepers",
      linkLabel: "Goalkeepers",
    },
    interactions: {
      title: "Interactions Logged",
      description: "Durable interactions recorded in the selected window.",
      to: "/interactions",
      linkLabel: "Interaction log",
    },
    duty: {
      title: "Duty of Care",
      description: "Reference-only cadence bands; not a canonical operational count.",
      to: "/goalkeepers",
      linkLabel: "Goalkeepers",
    },
    reports: {
      title: "Match Reports",
      description: "Match reports with match dates in the selected period.",
      to: "/reports",
      linkLabel: "All reports",
    },
    mentors: {
      title: "Active Mentors",
      description: "Accounts holding mentor access and their recorded output.",
      to: "/mentors",
      linkLabel: "Users & roles",
    },
    events: {
      title: "Scheduled Events",
      description: "Upcoming entries on the shared team calendar.",
      to: "/calendar",
      linkLabel: "Calendar",
    },
    alerts: {
      title: "System Alerts",
      description: "Reference alert feed; live operational alerts are not connected.",
      to: "/alerts",
      linkLabel: "Alerts",
    },
  };

const DUTY_LEVELS: { level: DutyLevel; label: string }[] = [
  { level: "overdue", label: "Overdue" },
  { level: "due_soon", label: "Due soon" },
  { level: "up_to_date", label: "Up to date" },
  { level: "not_required", label: "Not required" },
  { level: "not_enough_data", label: "Not enough data" },
];

interface InsightSearch {
  from: string;
  to: string;
  level: string;
}

export const Route = createFileRoute("/insights/$metric")({
  validateSearch: (search: Record<string, unknown>): InsightSearch => ({
    from: typeof search.from === "string" ? search.from : "",
    to: typeof search.to === "string" ? search.to : "",
    level: typeof search.level === "string" ? search.level : "",
  }),
  head: ({ params }) => {
    const meta =
      META[(params.metric as Metric) in META ? (params.metric as Metric) : "goalkeepers"];
    const title = `${meta.title} breakdown — Mentor Hub`;
    return {
      meta: [
        { title },
        { name: "description", content: meta.description },
        { property: "og:title", content: title },
        { property: "og:description", content: meta.description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: InsightDrilldown,
});

function Row({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">{children}</div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
      {label}
    </div>
  );
}

function availableCount(isLoading: boolean, isError: boolean, count: number): string | number {
  return isLoading ? "…" : isError ? "—" : count;
}

function InsightDrilldown() {
  const { metric } = Route.useParams();
  const search = Route.useSearch();
  const { user, can } = useAuth();
  const navigate = useNavigate();

  const active: Metric = (METRICS as readonly string[]).includes(metric)
    ? (metric as Metric)
    : "goalkeepers";
  const meta = META[active];

  const period = useMemo(() => {
    const fallback = lastNDaysPeriod(14);
    return {
      fromDate: search.from ? search.from.slice(0, 10) : fallback.fromDate,
      toDate: search.to ? search.to.slice(0, 10) : fallback.toDate,
      from: search.from || fallback.from,
      to: search.to || fallback.to,
    };
  }, [search.from, search.to]);

  const enabled = Boolean(user) && user?.role !== "mentor";
  const canViewSystemAlerts = can("alerts.view");
  const visibleMetrics = canViewSystemAlerts
    ? METRICS
    : METRICS.filter((candidate) => candidate !== "alerts");

  useEffect(() => {
    if (!user) navigate({ to: "/login", search: { next: "/" }, replace: true });
    else if (user.role === "mentor") navigate({ to: "/", replace: true });
  }, [user, navigate]);

  const fetchPlayers = useServerFn(listPlayers);
  const fetchUsers = useServerFn(listUsersAndRoles);
  const fetchMentorDirectory = useServerFn(listAssignableMentors);
  const fetchReports = useServerFn(listMatchReports);
  const fetchEvents = useServerFn(listCalendarEvents);

  const players = useQuery({
    queryKey: ["players"],
    queryFn: () => fetchPlayers(),
    enabled: enabled && active === "goalkeepers",
    staleTime: 30_000,
  });
  const users = useQuery({
    queryKey: ["users-and-roles"],
    queryFn: () => fetchUsers(),
    enabled: enabled && active === "mentors",
    staleTime: 30_000,
  });
  const mentorDirectory = useQuery({
    queryKey: ["users-and-roles", "active-mentor-directory"],
    queryFn: () => fetchMentorDirectory(),
    enabled: enabled && active === "mentors",
    staleTime: 30_000,
  });
  const reports = useQuery({
    queryKey: ["match-reports"],
    queryFn: () => fetchReports(),
    enabled: enabled && active === "reports",
    staleTime: 30_000,
    retry: 1,
  });
  const events = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => fetchEvents(),
    enabled: enabled && active === "events",
    staleTime: 30_000,
  });
  const interactions = useLoggedInteractions(
    enabled && (active === "interactions" || active === "duty"),
  );

  const dutySource = useMemo(
    () =>
      (interactions.data ?? []).map((i) => ({
        gkId: i.gkSlug,
        type: i.interactionType,
        date: i.occurredAt,
      })),
    [interactions.data],
  );

  if (!user || user.role === "mentor") return null;
  if (active === "alerts" && !canViewSystemAlerts) {
    return (
      <RequirePermission permission="alerts.view">
        <></>
      </RequirePermission>
    );
  }

  const periodLabel = `${period.fromDate} → ${period.toDate}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={meta.title}
        description={`${meta.description}${active === "interactions" || active === "reports" ? ` · ${periodLabel}` : ""}`}
        action={
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              to={meta.to}
              className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1"
            >
              {meta.linkLabel} <ArrowUpRight className="size-3" />
            </Link>
          </div>
        }
      />

      <nav className="flex flex-wrap gap-2">
        {visibleMetrics.map((m) => (
          <Link
            key={m}
            to="/insights/$metric"
            params={{ metric: m }}
            search={{ from: period.fromDate, to: period.toDate, level: "" }}
            className={`px-2.5 h-7 inline-flex items-center border text-[10px] font-mono uppercase tracking-widest ${
              m === active
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {META[m].title}
          </Link>
        ))}
      </nav>

      <div className="command-panel p-5">
        {active === "goalkeepers" && (
          <>
            <SectionTitle>{`Player records (${availableCount(players.isLoading, players.isError, players.data?.length ?? 0)})`}</SectionTitle>
            <div className="divide-y divide-border">
              {players.isLoading ? (
                <Empty label="Loading…" />
              ) : players.isError ? (
                <Empty label="Roster unavailable" />
              ) : (players.data ?? []).length === 0 ? (
                <Empty label="No player records" />
              ) : (
                (players.data ?? []).map((p) => (
                  <Row
                    key={p.id}
                    right={
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {p.league}
                      </span>
                    }
                  >
                    <Link
                      to="/system/players/$playerId"
                      params={{ playerId: p.id }}
                      className="text-xs font-medium hover:text-primary"
                    >
                      {p.full_name}
                    </Link>
                    <div className="text-[10px] text-muted-foreground">
                      {p.current_club}
                      {p.on_loan && p.parent_club ? ` · on loan from ${p.parent_club}` : ""}
                    </div>
                  </Row>
                ))
              )}
            </div>
          </>
        )}

        {active === "interactions" &&
          (() => {
            const rows = (interactions.data ?? [])
              .filter(
                (i) =>
                  isDashboardInteractionType(i.interactionType) &&
                  isDateOnlyInPeriod(i.occurredAt, period.fromDate, period.toDate),
              )
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
            return (
              <>
                <SectionTitle
                  action={
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {periodLabel}
                    </span>
                  }
                >{`Interactions (${availableCount(interactions.isLoading, interactions.isError, rows.length)})`}</SectionTitle>
                <div className="divide-y divide-border">
                  {interactions.isLoading ? (
                    <Empty label="Loading…" />
                  ) : interactions.isError ? (
                    <Empty label="Interactions unavailable" />
                  ) : rows.length === 0 ? (
                    <Empty label="No interactions in this window" />
                  ) : (
                    rows.map((i) => (
                      <Row
                        key={i.id}
                        right={
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {formatRelative(i.occurredAt)}
                          </span>
                        }
                      >
                        <div className="text-xs font-medium">
                          {i.goalkeeperName}
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            · {i.interactionType}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {i.mentorName}
                          {i.club ? ` · ${i.club}` : ""}
                          {i.outcome ? ` · ${i.outcome}` : ""}
                        </div>
                      </Row>
                    ))
                  )}
                </div>
              </>
            );
          })()}

        {active === "duty" &&
          (() => {
            const graded = goalkeepers.map((g) => ({
              gk: g,
              duty: dutyStatusForGk(g, dutySource),
            }));
            const filtered = search.level
              ? graded.filter((r) => r.duty.level === search.level)
              : graded;
            return (
              <>
                <SectionTitle>{`Reference Duty of Care (${availableCount(interactions.isLoading, interactions.isError, filtered.length)})`}</SectionTitle>
                <div className="flex flex-wrap gap-2 mb-4">
                  <Link
                    to="/insights/$metric"
                    params={{ metric: "duty" }}
                    search={{ from: period.fromDate, to: period.toDate, level: "" }}
                    className={`px-2.5 h-7 inline-flex items-center border text-[10px] font-mono uppercase tracking-widest ${!search.level ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                  >
                    All (
                    {availableCount(interactions.isLoading, interactions.isError, graded.length)})
                  </Link>
                  {DUTY_LEVELS.map((l) => {
                    const count = graded.filter((r) => r.duty.level === l.level).length;
                    return (
                      <Link
                        key={l.level}
                        to="/insights/$metric"
                        params={{ metric: "duty" }}
                        search={{ from: period.fromDate, to: period.toDate, level: l.level }}
                        className={`px-2.5 h-7 inline-flex items-center border text-[10px] font-mono uppercase tracking-widest ${search.level === l.level ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
                      >
                        {l.label} (
                        {availableCount(interactions.isLoading, interactions.isError, count)})
                      </Link>
                    );
                  })}
                </div>
                <div className="divide-y divide-border">
                  {interactions.isLoading ? (
                    <Empty label="Loading…" />
                  ) : interactions.isError ? (
                    <Empty label="Duty of Care unavailable" />
                  ) : filtered.length === 0 ? (
                    <Empty label="No goalkeepers in this band" />
                  ) : (
                    filtered.map(({ gk, duty }) => (
                      <Row
                        key={gk.id}
                        right={
                          <span
                            className={`text-[10px] font-mono uppercase tracking-widest ${duty.level === "overdue" || duty.level === "due_soon" ? "text-warning" : duty.level === "up_to_date" ? "text-success" : "text-muted-foreground"}`}
                          >
                            {duty.label}
                            {duty.days ? ` · ${duty.days}d` : ""}
                          </span>
                        }
                      >
                        <Link
                          to="/goalkeepers/$gkId"
                          params={{ gkId: gk.id }}
                          className="text-xs font-medium hover:text-primary inline-flex items-center gap-2"
                        >
                          {gk.name}
                          <TierBadge tier={gk.tier} />
                        </Link>
                        <div className="text-[10px] text-muted-foreground">{gk.club}</div>
                      </Row>
                    ))
                  )}
                </div>
              </>
            );
          })()}

        {active === "reports" &&
          (() => {
            const rows = (reports.data?.reports ?? [])
              .filter((r) => isDateOnlyInPeriod(r.match_date, period.fromDate, period.toDate))
              .sort((a, b) => (b.match_date ?? "").localeCompare(a.match_date ?? ""));
            return (
              <>
                <SectionTitle
                  action={
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {periodLabel}
                    </span>
                  }
                >{`Match reports (${availableCount(reports.isLoading, reports.isError, rows.length)})`}</SectionTitle>
                <div className="divide-y divide-border">
                  {reports.isLoading ? (
                    <Empty label="Loading…" />
                  ) : reports.isError ? (
                    <Empty label="Reports unavailable" />
                  ) : rows.length === 0 ? (
                    <Empty label="No reports in this window" />
                  ) : (
                    rows.map((r) => (
                      <Row
                        key={r.report_id}
                        right={
                          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                            {r.average != null ? r.average.toFixed(2) : "—"}
                          </span>
                        }
                      >
                        <Link
                          to="/reports/$reportId"
                          params={{ reportId: r.report_id }}
                          className="text-xs font-medium hover:text-primary"
                        >
                          {r.goalkeeper}
                        </Link>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {r.match_date ?? "No date"}
                          {r.team ? ` · ${r.team}` : ""}
                          {r.opponent ? ` v ${r.opponent}` : ""}
                          {r.coach ? ` · ${r.coach}` : ""}
                        </div>
                      </Row>
                    ))
                  )}
                </div>
              </>
            );
          })()}

        {active === "mentors" &&
          (() => {
            const rows = buildActiveMentorInsightRows(mentorDirectory.data ?? [], users.data ?? []);
            const isLoading = users.isLoading || mentorDirectory.isLoading;
            const isError = users.isError || mentorDirectory.isError;
            return (
              <>
                <SectionTitle>{`Mentors (${availableCount(isLoading, isError, rows.length)})`}</SectionTitle>
                <div className="divide-y divide-border">
                  {isLoading ? (
                    <Empty label="Loading…" />
                  ) : isError ? (
                    <Empty label="Directory unavailable" />
                  ) : rows.length === 0 ? (
                    <Empty label="No mentor accounts" />
                  ) : (
                    rows.map((u) => (
                      <Row
                        key={u.id}
                        right={
                          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                            {u.interactionsLogged} int · {u.matchReportsSubmitted} rep
                          </span>
                        }
                      >
                        <div className="text-xs font-medium">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          {u.isManager ? "Mentor Manager" : "Mentor"}
                        </div>
                      </Row>
                    ))
                  )}
                </div>
              </>
            );
          })()}

        {active === "events" &&
          (() => {
            const today = new Date().toISOString().slice(0, 10);
            const rows = (events.data ?? [])
              .filter((e) => e.event_date >= today)
              .sort((a, b) => a.event_date.localeCompare(b.event_date));
            return (
              <>
                <SectionTitle>{`Scheduled events (${availableCount(events.isLoading, events.isError, rows.length)})`}</SectionTitle>
                <div className="divide-y divide-border">
                  {events.isLoading ? (
                    <Empty label="Loading…" />
                  ) : events.isError ? (
                    <Empty label="Calendar unavailable" />
                  ) : rows.length === 0 ? (
                    <Empty label="No scheduled events" />
                  ) : (
                    rows.map((e) => (
                      <Row
                        key={e.id}
                        right={<CalendarClock className="size-3.5 text-muted-foreground/60" />}
                      >
                        <div className="text-[10px] font-mono uppercase tracking-widest text-primary mb-1">
                          {formatRelative(e.event_date)}
                          {e.start_time ? ` · ${e.start_time.slice(0, 5)}` : ""}
                        </div>
                        <div className="text-xs font-medium truncate">{e.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {e.event_type}
                          {e.goalkeeper_name ? ` · ${e.goalkeeper_name}` : ""}
                          {e.location ? ` · ${e.location}` : ""}
                        </div>
                      </Row>
                    ))
                  )}
                </div>
              </>
            );
          })()}

        {active === "alerts" && (
          <>
            <SectionTitle>Reference alerts (—)</SectionTitle>
            <div className="space-y-2">
              {systemAlerts.length === 0 ? (
                <Empty label="Live alert feed not connected" />
              ) : (
                systemAlerts.map((a) => (
                  <div
                    key={a.id}
                    className={`border p-3 ${
                      a.severity === "high"
                        ? "border-destructive/30 bg-destructive/5 text-destructive"
                        : a.severity === "medium"
                          ? "border-warning/30 bg-warning/5 text-warning"
                          : "border-info/30 bg-info/5 text-info"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
                        {a.kind}
                      </span>
                      <AlertTriangle className="size-3" />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">{a.message}</p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
