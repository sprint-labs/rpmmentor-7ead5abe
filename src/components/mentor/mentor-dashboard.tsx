import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  FileText,
  Video,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { MentorPrimaryActions } from "./mentor-primary-actions";
import { cn } from "@/lib/utils";
import {
  Card,
  StatCard,
  SectionTitle,
  Avatar,
  TierBadge,
  TierLevelBadge,
  Pill,
} from "@/components/primitives";
import { getMentorDashboardStats } from "@/lib/mentor-dashboard.functions";
import {
  formatUpcomingEventDateTime,
  upcomingGroupLabel,
  UPCOMING_GROUP_ORDER,
  type MentorUpcomingInteraction,
} from "@/lib/mentor-upcoming-events";
import { mentors } from "@/lib/mock-data";
import type { Tier } from "@/lib/mock-data";
import type { SessionUser } from "@/lib/auth";
import { logDashboardClick } from "@/lib/analytics.functions";
import { mentorDashboardMetricCardLabels } from "./mentor-dashboard-cards";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { useAuth } from "@/lib/auth";
import { listEventFollowUps } from "@/lib/events/follow-up.functions";
import { eventFollowUpsQueryKey } from "@/lib/events/query-keys";
import { followUpRequirementLabel } from "@/lib/events/follow-up";
import {
  FollowUpActionLink,
  FollowUpStatusPill,
  followUpDetail,
} from "@/components/events/follow-up-status";
import { formatDateOnly } from "@/lib/interactions/schema";

import { lastNDaysPeriod } from "@/lib/dashboard-period";
import { BulletinDashboardCard } from "@/components/bulletins/dashboard-card";

interface Props {
  user: SessionUser;
  mentorProfileId: string;
}

function formatEventDateTime(iso: string) {
  const d = new Date(iso);
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  const month = d.toLocaleString("en-GB", { month: "long" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${month} ${day}${suffix} · ${time}`;
}

function formatRelativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// `value` is the stored planned type and must not be renamed: normalisePlannedType()
// maps "Match" and "Observation" onto "Attend Live Match", and /interactions filters
// on that same string. Only the chip caption is presentational.
const PLANNED_TYPE_OPTIONS = [
  { value: "Coffee Catch Up", label: "Coffee Catch Up" },
  { value: "Attend Live Match", label: "Match Day Events" },
  { value: "Training Ground Visit", label: "Training Ground Visit" },
] as const;

export function MentorDashboard({ user }: Props) {
  const { can } = useAuth();
  const canLog = can("interactions.log");
  const canSubmitReport = can("reports.submit");
  const canViewCalendar = can("calendar.view");
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  const [logPrefill, setLogPrefill] = useState<{ gkId?: string; gkName?: string }>({});
  function openLog(gkId?: string | null, gkName?: string | null) {
    setLogPrefill({ gkId: gkId ?? undefined, gkName: gkName ?? undefined });
    setWorkflow("interaction");
  }
  const [rangeDays, setRangeDays] = useState(14);
  const [filters, setFilters] = useState<string[]>([]);
  const fetchStats = useServerFn(getMentorDashboardStats);
  const queryClient = useQueryClient();
  const period_ = useMemo(() => lastNDaysPeriod(rangeDays), [rangeDays]);
  const periodSearch = useMemo(() => ({ from: period_.from, to: period_.to }), [period_]);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mentor-dashboard-stats", rangeDays, period_.from, period_.to],
    queryFn: () =>
      fetchStats({
        data: {
          days: rangeDays,
          from: period_.from,
          to: period_.to,
          fromDate: period_.fromDate,
          toDate: period_.toDate,
        },
      }),
  });

  useEffect(() => {
    const handleReportSubmitted = () => {
      void queryClient.invalidateQueries({ queryKey: ["mentor-dashboard-stats"] });
    };
    window.addEventListener("rpm:report-submitted", handleReportSubmitted);
    return () => window.removeEventListener("rpm:report-submitted", handleReportSubmitted);
  }, [queryClient]);

  // Write-ups this mentor owes after an event that has already happened. Read
  // from the database, so a saved Match Report or Interaction clears it.
  const fetchFollowUps = useServerFn(listEventFollowUps);
  const {
    data: followUpData,
    isError: isFollowUpsError,
    refetch: refetchFollowUps,
  } = useQuery({
    queryKey: eventFollowUpsQueryKey,
    queryFn: () => fetchFollowUps(),
    staleTime: 30_000,
  });
  const writeUpsDue = useMemo(
    () =>
      (followUpData?.rows ?? [])
        .filter(
          (r) =>
            r.mine &&
            r.followUp.kind !== null &&
            (r.followUp.status === "pending" || r.followUp.status === "overdue"),
        )
        .sort((a, b) => a.followUp.deadlineMs - b.followUp.deadlineMs),
    [followUpData],
  );

  const firstName = user.name.split(" ")[0];
  const upcoming = useMemo(() => data?.upcomingList ?? [], [data?.upcomingList]);
  const outstanding = data?.outstandingItems ?? [];
  const outstandingUnavailable = !isLoading && !isError && data?.outstandingAvailable === false;
  const upcomingUnavailable = !isLoading && !isError && data?.upcomingAvailable === false;
  const updatedAt = data?.lastUpdatedAt ? formatRelativeTime(data.lastUpdatedAt) : undefined;
  const period = `Last ${rangeDays} days`;
  const [showOutstanding, setShowOutstanding] = useState(false);

  const filteredUpcoming = useMemo(() => {
    if (filters.length === 0) return upcoming;
    return upcoming.filter((e) => e.plannedType && filters.includes(e.plannedType));
  }, [upcoming, filters]);

  const groupedUpcoming = useMemo(() => {
    const map = new Map<string, MentorUpcomingInteraction[]>();
    for (const item of filteredUpcoming) {
      const label = upcomingGroupLabel(item.date);
      const list = map.get(label) ?? [];
      list.push(item);
      map.set(label, list);
    }
    return map;
  }, [filteredUpcoming]);

  const mentorName = useMemo(() => {
    const id = data?.mentorProfileId ?? user.mentorId;
    if (id) return mentors.find((m) => m.id === id)?.name;
    if (user.actualRole === "mentor") return user.name;
    return undefined;
  }, [data?.mentorProfileId, user.mentorId, user.actualRole, user.name]);
  const effectiveMentorId = data?.mentorProfileId ?? user.mentorId ?? "";
  const reportsSearch = {
    ...periodSearch,
    coach: data?.coachIdentity ?? "",
    mentorProfileId: effectiveMentorId,
    source: "reports-submitted",
  };
  const interactionsSearch = {
    ...periodSearch,
    mentorId: effectiveMentorId,
    type: filters.length === 1 ? filters[0]! : "",
    source: "interactions-logged",
  };
  const toggleFilter = (type: string) => {
    setFilters((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const clearFilters = () => setFilters([]);

  const trackClick = (source: string, destination: string) => {
    void logDashboardClick({
      data: {
        source,
        destination,
        periodDays: rangeDays,
        periodFrom: periodSearch.from,
        periodTo: periodSearch.to,
        mentorProfileId: effectiveMentorId || undefined,
        mentorName: mentorName || undefined,
        effectiveRole: user.role,
      },
    }).catch(() => {});
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-display font-bold uppercase tracking-[0.02em]">
          Hello, {firstName}
        </h1>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mt-2">
          {isLoading
            ? "Loading your dashboard…"
            : isError
              ? "Couldn't load your dashboard."
              : "Match reports and interactions first"}
        </p>
        {isError && (
          <button
            onClick={() => refetch()}
            className="mt-2 text-xs uppercase tracking-wider text-primary underline"
          >
            Retry
          </button>
        )}
      </header>

      <MentorPrimaryActions
        canSubmitReport={canSubmitReport}
        canLogInteraction={canLog}
        canViewCalendar={canViewCalendar}
        onLogReport={() => setWorkflow("report")}
        onLogInteraction={() => openLog()}
      />

      <BulletinDashboardCard scope="mine" />

      <section aria-label="Your activity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/reports"
            search={reportsSearch}
            onClick={() => trackClick("reports-submitted", "/reports")}
            className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="View match reports"
          >
            <StatCard
              label={mentorDashboardMetricCardLabels.matchReportsSubmitted}
              value={isLoading ? "…" : isError ? "—" : (data?.reportsLast14 ?? "—")}
              hint={isError ? "Count unavailable" : `Match dates · ${period.toLowerCase()}`}
              accent="primary"
              updatedAt={updatedAt}
            />
          </Link>
          <Link
            to="/interactions"
            search={interactionsSearch}
            onClick={() => trackClick("interactions-logged", "/interactions")}
            className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-info/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
            aria-label="View interactions"
          >
            <StatCard
              label={mentorDashboardMetricCardLabels.interactionsLogged}
              value={isLoading ? "…" : isError ? "—" : (data?.interactionsLast14 ?? "—")}
              hint={isError ? "Count unavailable" : period}
              accent="info"
              updatedAt={updatedAt}
            />
          </Link>
        </div>
      </section>

      <Card className="p-4">
        <button
          onClick={() => setShowOutstanding((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left"
          aria-expanded={showOutstanding}
        >
          <div className="flex items-center gap-2">
            {showOutstanding ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
              Outstanding Actions Breakdown
            </h2>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border bg-destructive/15 text-destructive border-destructive/40 tabular-nums font-mono">
              {isLoading ? "…" : isError || outstandingUnavailable ? "—" : outstanding.length}
            </span>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {showOutstanding ? "Hide" : "Show"}
          </span>
        </button>

        {showOutstanding &&
          (isLoading ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              Loading outstanding actions…
            </div>
          ) : isError || outstandingUnavailable ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              Outstanding actions are unavailable right now.
            </div>
          ) : outstanding.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">
              All caught up — nothing overdue.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-border">
              {outstanding.map((item) => {
                const isReport = item.kind === "missing_report";
                const Icon = isReport ? FileText : Video;
                const toneClass = isReport
                  ? "bg-destructive/15 text-destructive border-destructive/30"
                  : "bg-warning/15 text-warning border-warning/30";
                const actionHref = isReport ? "/reports" : "/media";
                const actionSearch = isReport
                  ? {
                      from: "",
                      to: "",
                      coach: mentorName ?? "",
                      mentorProfileId: effectiveMentorId,
                      source: "outstanding-report",
                    }
                  : {
                      from: "",
                      to: "",
                      uploaderName: mentorName ?? "",
                      mentorProfileId: effectiveMentorId,
                      kind: "video",
                      source: "outstanding-clip",
                    };
                return (
                  <div key={item.id} className="flex items-center gap-3 py-2.5">
                    <Avatar initials={item.gkInitials ?? "—"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${toneClass}`}
                        >
                          <Icon className="size-3" />
                          {isReport ? "Missing report" : "Missing clip"}
                        </span>
                        <span className="font-medium text-sm truncate">
                          {item.gkName ?? "Unassigned"}
                        </span>
                        {item.gkStatus && <TierBadge tier={item.gkStatus as Tier} />}
                        {item.gkTierLevel && <TierLevelBadge level={item.gkTierLevel} />}
                        {item.daysOverdue > 0 && (
                          <Pill tone="destructive">
                            <AlertTriangle className="size-3 mr-0.5" />
                            {item.daysOverdue}d overdue
                          </Pill>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {item.label}
                        {item.gkClub ? ` · ${item.gkClub}` : ""}
                      </div>
                      <div className="text-[10px] text-muted-foreground/80 mt-0.5 font-mono tabular-nums">
                        Observed {formatEventDateTime(item.observationDate)} · Due{" "}
                        {formatEventDateTime(item.dueDate)} · Actionable by {item.actionableBy}
                      </div>
                    </div>
                    <Link
                      to={actionHref}
                      search={actionSearch}
                      onClick={() =>
                        trackClick(isReport ? "outstanding-report" : "outstanding-clip", actionHref)
                      }
                      className="shrink-0 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary inline-flex items-center gap-1"
                    >
                      {isReport ? "Submit report" : "Upload clip"}
                      <ArrowUpRight className="size-3" />
                    </Link>
                    {canLog && (
                      <button
                        type="button"
                        onClick={() => openLog(item.gkId, item.gkName)}
                        className="shrink-0 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary inline-flex items-center gap-1"
                      >
                        <Plus className="size-3" /> Log
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
      </Card>

      {(isFollowUpsError || writeUpsDue.length > 0) && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>Write-ups Due</SectionTitle>
            {!isFollowUpsError && (
              <Link to="/follow-ups" className="text-[11px] text-primary hover:underline">
                See all follow-ups
              </Link>
            )}
          </div>
          {isFollowUpsError ? (
            <div className="py-4 text-xs text-muted-foreground">
              <p>Write-ups are unavailable right now.</p>
              <button
                type="button"
                onClick={() => void refetchFollowUps()}
                className="mt-2 uppercase tracking-wider text-primary underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                Each of these events has happened. You have 48 hours from the scheduled time to
                record what came out of it.
              </p>
              <div className="mt-3 divide-y divide-border">
                {writeUpsDue.map((row) => (
                  <div key={row.eventId} className="flex flex-wrap items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FollowUpStatusPill status={row.followUp.status} />
                        <span className="truncate text-sm font-medium">
                          {row.goalkeeperName || "Unnamed goalkeeper"}
                        </span>
                        <span className="text-xs text-muted-foreground">{row.eventType}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateOnly(row.eventDate)}
                        {row.startTime ? ` · ${row.startTime.slice(0, 5)}` : ""}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {followUpDetail(row.followUp, row.waiverReason, row.cancellationReason)}
                      </div>
                    </div>
                    <FollowUpActionLink
                      event={{
                        id: row.eventId,
                        title: row.title,
                        eventType: row.eventType,
                        eventDate: row.eventDate,
                        startTime: row.startTime,
                        endTime: row.endTime,
                        goalkeeperName: row.goalkeeperName,
                        playerId: row.playerId,
                      }}
                      followUp={row.followUp}
                      label={`Submit ${followUpRequirementLabel(row.followUp.kind)}`}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      <Card className="p-4">
        <SectionTitle>Upcoming Interactions and Matches</SectionTitle>

        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `Next ${rangeDays} days`}
          </span>
          <div className="flex items-center gap-1" role="tablist" aria-label="Interaction range">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={rangeDays === d}
                onClick={() => setRangeDays(d)}
                className={cn(
                  "px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md border transition-colors",
                  rangeDays === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50",
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 mb-3">
          <button
            onClick={clearFilters}
            className={cn(
              "px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md border transition-colors",
              filters.length === 0
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:border-primary/50",
            )}
            aria-pressed={filters.length === 0}
          >
            All
          </button>
          {PLANNED_TYPE_OPTIONS.map(({ value, label }) => {
            const active = filters.includes(value);
            return (
              <button
                key={value}
                onClick={() => toggleFilter(value)}
                className={cn(
                  "px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50",
                )}
                aria-pressed={active}
              >
                {label}
              </button>
            );
          })}
        </div>

        {upcomingUnavailable ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="size-10 rounded-full bg-muted grid place-items-center">
              <CalendarPlus className="size-5 text-muted-foreground" />
            </div>
            <div className="max-w-xs">
              <p className="text-sm font-medium text-foreground">Calendar figures unavailable</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your report and interaction counts are still up to date.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary"
            >
              Retry
            </button>
          </div>
        ) : filteredUpcoming.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="size-10 rounded-full bg-muted grid place-items-center">
              <CalendarPlus className="size-5 text-muted-foreground" />
            </div>
            <div className="max-w-xs">
              <p className="text-sm font-medium text-foreground">
                {isLoading ? "Loading your calendar…" : "No interactions scheduled"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isLoading
                  ? "This may take a moment."
                  : filters.length > 0
                    ? "No upcoming interactions match the selected filters."
                    : `There are no upcoming interactions in the next ${rangeDays} days.`}
              </p>
            </div>
            {filters.length > 0 ? (
              <button
                onClick={clearFilters}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary inline-flex items-center gap-1"
              >
                Clear filters
              </button>
            ) : (
              <Link
                to="/calendar"
                search={{ gkId: "", new: false }}
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary inline-flex items-center gap-1"
              >
                View Calendar <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {UPCOMING_GROUP_ORDER.map((label) => {
              const list = groupedUpcoming.get(label);
              if (!list || list.length === 0) return null;
              return (
                <div key={label}>
                  <div className="flex items-center justify-between px-1 mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {label}
                    </h3>
                    <span className="text-[10px] tabular-nums text-muted-foreground/70">
                      {list.length}
                    </span>
                  </div>
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {list.map((e) => (
                      <div key={e.id} className="flex items-center gap-3 py-2.5 px-3">
                        <Avatar initials={e.gkInitials ?? "—"} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">
                              {e.gkName ?? "Unassigned"}
                            </span>
                            {e.gkStatus && <TierBadge tier={e.gkStatus as Tier} />}
                            {e.gkFreeAgent && <Pill tone="warning">Free Agent</Pill>}
                            {e.gkTierLevel && <TierLevelBadge level={e.gkTierLevel} />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {e.gkClub
                              ? `${e.gkClub}${e.gkLeague ? ` — ${e.gkLeague}` : ""}`
                              : e.gkFreeAgent
                                ? "Free Agent"
                                : e.title}
                          </div>
                        </div>
                        <div className="hidden md:block text-sm font-medium text-foreground/90 truncate max-w-[240px]">
                          {e.plannedType ?? e.type}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium tabular-nums font-mono flex items-center gap-1 justify-end">
                            <CalendarClock className="size-3 text-muted-foreground" />
                            {formatUpcomingEventDateTime(e.date, e.startTime)}
                          </div>
                        </div>
                        {canLog && (
                          <button
                            type="button"
                            onClick={() => openLog(e.gkId, e.gkName)}
                            className="shrink-0 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary inline-flex items-center gap-1"
                          >
                            <Plus className="size-3" /> Log
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <WorkflowDialog
        kind={workflow}
        prefillGkId={logPrefill.gkId}
        prefillGoalkeeper={logPrefill.gkName}
        onClose={() => {
          setWorkflow(null);
          setLogPrefill({});
        }}
      />
    </div>
  );
}
