import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/primitives";
import { InteractionWorkbench } from "@/components/interaction-workbench";
import { MatchReportWorkbench } from "@/components/match-report-workbench";
import {
  ActiveMentorWorkbench,
  DutyOfCareWorkbench,
  PlayerRecordWorkbench,
  ScheduledEventWorkbench,
} from "@/components/insight-drilldowns";
import { useAuth } from "@/lib/auth";
import { useLoggedInteractions } from "@/lib/interactions/use-interactions";
import { listPlayers } from "@/lib/players.functions";
import { listUsersAndRoles } from "@/lib/users-and-roles.functions";
import { listMatchReports } from "@/lib/match-reports/reports.functions";
import { listAssignableMentors, listCalendarEvents } from "@/lib/calendar.functions";
import { alerts as systemAlerts, goalkeepers, dutyStatusForGk } from "@/lib/mock-data";
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

function Empty({ label }: { label: string }) {
  return (
    <div className="py-10 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
      {label}
    </div>
  );
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
            {active === "interactions" ? (
              <Link
                to="/interactions"
                search={{
                  from: period.fromDate,
                  to: period.toDate,
                  mentorId: "",
                  type: "",
                  source: "interactions-logged",
                }}
                className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1"
              >
                Open full interaction log <ArrowUpRight className="size-3" />
              </Link>
            ) : (
              <Link
                to={meta.to}
                className="text-[10px] font-mono uppercase tracking-widest text-primary inline-flex items-center gap-1"
              >
                {meta.linkLabel} <ArrowUpRight className="size-3" />
              </Link>
            )}
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
        {active === "goalkeepers" &&
          (() => {
            if (players.isLoading) return <Empty label="Loading…" />;
            if (players.isError) return <Empty label="Roster unavailable" />;
            const rows = players.data ?? [];
            if (rows.length === 0) return <Empty label="No player records" />;
            return <PlayerRecordWorkbench players={rows} />;
          })()}

        {active === "interactions" &&
          (() => {
            const rows = (interactions.data ?? [])
              .filter(
                (i) =>
                  isDashboardInteractionType(i.interactionType) &&
                  isDateOnlyInPeriod(i.occurredAt, period.fromDate, period.toDate),
              )
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
            if (interactions.isLoading) return <Empty label="Loading…" />;
            if (interactions.isError) return <Empty label="Interactions unavailable" />;
            if (rows.length === 0) return <Empty label="No interactions in this window" />;
            return <InteractionWorkbench interactions={rows} periodLabel={periodLabel} />;
          })()}

        {active === "duty" &&
          (() => {
            if (interactions.isLoading) return <Empty label="Loading…" />;
            if (interactions.isError) return <Empty label="Duty of Care unavailable" />;
            const rows = goalkeepers.map((gk) => ({
              gk,
              duty: dutyStatusForGk(gk, dutySource),
            }));
            if (rows.length === 0) return <Empty label="No goalkeepers on the roster" />;
            return <DutyOfCareWorkbench rows={rows} initialLevel={search.level} />;
          })()}

        {active === "reports" &&
          (() => {
            const rows = (reports.data?.reports ?? [])
              .filter((r) => isDateOnlyInPeriod(r.match_date, period.fromDate, period.toDate))
              .sort((a, b) => (b.match_date ?? "").localeCompare(a.match_date ?? ""));
            if (reports.isLoading) return <Empty label="Loading…" />;
            if (reports.isError) return <Empty label="Reports unavailable" />;
            if (rows.length === 0) return <Empty label="No reports in this window" />;
            return <MatchReportWorkbench reports={rows} periodLabel={periodLabel} />;
          })()}

        {active === "mentors" &&
          (() => {
            if (users.isLoading || mentorDirectory.isLoading) return <Empty label="Loading…" />;
            if (users.isError || mentorDirectory.isError)
              return <Empty label="Directory unavailable" />;
            const rows = buildActiveMentorInsightRows(mentorDirectory.data ?? [], users.data ?? []);
            if (rows.length === 0) return <Empty label="No mentor accounts" />;
            return <ActiveMentorWorkbench mentors={rows} />;
          })()}

        {active === "events" &&
          (() => {
            if (events.isLoading) return <Empty label="Loading…" />;
            if (events.isError) return <Empty label="Calendar unavailable" />;
            const today = new Date().toISOString().slice(0, 10);
            const rows = (events.data ?? [])
              .filter((e) => e.event_date >= today)
              .sort((a, b) => a.event_date.localeCompare(b.event_date));
            if (rows.length === 0) return <Empty label="No scheduled events" />;
            return <ScheduledEventWorkbench events={rows} />;
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
