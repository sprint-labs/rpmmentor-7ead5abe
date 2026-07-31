import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarClock, CalendarPlus, ChevronDown, ChevronRight, FileText, Video, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, StatCard, SectionTitle, Avatar, TierBadge, TierLevelBadge, Pill } from "@/components/primitives";
import { getMentorDashboardStats } from "@/lib/mentor-dashboard.functions";
import type { MentorUpcomingInteraction } from "@/lib/mentor-dashboard.functions";
import { mentors } from "@/lib/mock-data";
import type { Tier } from "@/lib/mock-data";
import type { SessionUser } from "@/lib/auth";
import { logDashboardClick } from "@/lib/analytics.functions";

function lastNDaysSearch(days: number) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

interface Props {
  user: SessionUser;
  mentorProfileId: string;
}

function formatEventDateTime(iso: string) {
  const d = new Date(iso);
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11 ? "st"
    : day % 10 === 2 && day !== 12 ? "nd"
    : day % 10 === 3 && day !== 13 ? "rd"
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

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfWeekMonday(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function interactionGroupLabel(date: string) {
  const now = new Date();
  const today = startOfDay(now);
  const eventDay = startOfDay(new Date(date));
  const daysDiff = Math.floor((eventDay - today) / 86400000);
  if (daysDiff === 0) return "Today";
  if (daysDiff === 1) return "Tomorrow";
  const thisWeek = startOfWeekMonday(now);
  const eventWeek = startOfWeekMonday(new Date(date));
  if (eventWeek === thisWeek) return "This week";
  if (eventWeek === thisWeek + 7 * 86400000) return "Next week";
  return "Later";
}

const groupOrder = ["Today", "Tomorrow", "This week", "Next week", "Later"] as const;

const PLANNED_TYPE_OPTIONS = ["Coffee Catch Up", "Attend Live Match", "Training Ground Visit"] as const;

export function MentorDashboard({ user }: Props) {
  const [rangeDays, setRangeDays] = useState(14);
  const [filters, setFilters] = useState<string[]>([]);
  const fetchStats = useServerFn(getMentorDashboardStats);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mentor-dashboard-stats", rangeDays],
    queryFn: () => fetchStats({ data: { days: rangeDays } }),
  });

  const firstName = user.name.split(" ")[0];
  const upcoming = data?.upcomingList ?? [];
  const outstanding = data?.outstandingItems ?? [];
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
      const label = interactionGroupLabel(item.date);
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
  const periodSearch = useMemo(() => lastNDaysSearch(rangeDays), [rangeDays]);
  const effectiveMentorId = data?.mentorProfileId ?? user.mentorId ?? "";
  const reportsSearch = { ...periodSearch, coach: mentorName ?? "", mentorProfileId: effectiveMentorId, source: "reports-submitted" };
  const interactionsSearch = { ...periodSearch, mentorId: effectiveMentorId, type: filters.length === 1 ? filters[0]! : "", source: "interactions-logged" };
  const mediaSearch = { ...periodSearch, uploaderName: mentorName ?? "", mentorProfileId: effectiveMentorId, kind: "video", source: "clips-posted" };
  const outstandingSearch = { ...periodSearch, coach: mentorName ?? "", mentorProfileId: effectiveMentorId, source: "outstanding-actions" };

  const toggleFilter = (type: string) => {
    setFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
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
              : `Your reporting activity — last ${rangeDays} days`}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Link
          to="/reports"
          search={reportsSearch}
          onClick={() => trackClick("reports-submitted", "/reports")}
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View match reports"
        >
          <StatCard
            label="Match Reports Submitted"
            value={data?.reportsLast14 ?? 0}
            hint={period}
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
            label="Interactions Logged"
            value={data?.interactionsLast14 ?? 0}
            hint={period}
            accent="info"
            updatedAt={updatedAt}
          />
        </Link>
        <Link
          to="/media"
          search={mediaSearch}
          onClick={() => trackClick("clips-posted", "/media")}
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View match clips"
        >
          <StatCard
            label="Match Clips Posted"
            value={data?.clipsLast14 ?? 0}
            hint={period}
            accent="primary"
            updatedAt={updatedAt}
          />
        </Link>
        <Link
          to="/reports"
          search={outstandingSearch}
          onClick={() => trackClick("outstanding-actions", "/reports")}
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-destructive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          aria-label="View outstanding actions"
        >
          <StatCard
            label="Outstanding Actions"
            value={data?.outstandingActions ?? 0}
            hint="Overdue reports & clip uploads"
            accent="destructive"
            emptyMessage="All caught up"
            updatedAt={updatedAt}
          />
        </Link>
      </div>

      <Card className="p-4">
        <button
          onClick={() => setShowOutstanding((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left"
          aria-expanded={showOutstanding}
        >
          <div className="flex items-center gap-2">
            {showOutstanding ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
            <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
              Outstanding Actions Breakdown
            </h2>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border bg-destructive/15 text-destructive border-destructive/40 tabular-nums font-mono">
              {outstanding.length}
            </span>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {showOutstanding ? "Hide" : "Show"}
          </span>
        </button>

        {showOutstanding && (
          outstanding.length === 0 ? (
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
                  ? { from: "", to: "", coach: mentorName ?? "", mentorProfileId: effectiveMentorId, source: "outstanding-report" }
                  : { from: "", to: "", uploaderName: mentorName ?? "", mentorProfileId: effectiveMentorId, kind: "video", source: "outstanding-clip" };
                return (
                  <div key={item.id} className="flex items-center gap-3 py-2.5">
                    <Avatar initials={item.gkInitials ?? "—"} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${toneClass}`}>
                          <Icon className="size-3" />
                          {isReport ? "Missing report" : "Missing clip"}
                        </span>
                        <span className="font-medium text-sm truncate">{item.gkName ?? "Unassigned"}</span>
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
                        Observed {formatEventDateTime(item.observationDate)} · Due {formatEventDateTime(item.dueDate)} · Actionable by {item.actionableBy}
                      </div>
                    </div>
                    <Link
                      to={actionHref}
                      search={actionSearch}
                      onClick={() => trackClick(isReport ? "outstanding-report" : "outstanding-clip", actionHref)}
                      className="shrink-0 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary inline-flex items-center gap-1"
                    >
                      {isReport ? "Submit report" : "Upload clip"}
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                );
              })}
            </div>
          )
        )}
      </Card>



      <Card className="p-4">
        <SectionTitle
          action={
            <Link to="/calendar" className="text-xs text-primary inline-flex items-center gap-1">
              Open calendar <ArrowUpRight className="size-3" />
            </Link>
          }
        >
          Upcoming Interactions
        </SectionTitle>

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
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
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
                : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
            )}
            aria-pressed={filters.length === 0}
          >
            All
          </button>
          {PLANNED_TYPE_OPTIONS.map((type) => {
            const active = filters.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className={cn(
                  "px-2.5 py-1 text-[11px] uppercase tracking-wider rounded-md border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
                )}
                aria-pressed={active}
              >
                {type}
              </button>
            );
          })}
        </div>

        {filteredUpcoming.length === 0 ? (
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
                to="/interactions"
                className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent/40 text-primary inline-flex items-center gap-1"
              >
                Schedule interaction <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {groupOrder.map((label) => {
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
                            <span className="font-medium text-sm truncate">{e.gkName ?? "Unassigned"}</span>
                            {e.gkStatus && <TierBadge tier={e.gkStatus as Tier} />}
                            {e.gkFreeAgent && <Pill tone="warning">Free Agent</Pill>}
                            {e.gkTierLevel && <TierLevelBadge level={e.gkTierLevel} />}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {e.gkClub ? `${e.gkClub}${e.gkLeague ? ` — ${e.gkLeague}` : ""}` : "Free Agent"}
                          </div>
                        </div>
                        <div className="hidden md:block text-sm font-medium text-foreground/90 truncate max-w-[240px]">
                          {e.plannedType ?? e.type}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium tabular-nums font-mono flex items-center gap-1 justify-end">
                            <CalendarClock className="size-3 text-muted-foreground" />
                            {formatEventDateTime(e.date)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
