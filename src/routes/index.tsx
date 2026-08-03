import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, PageHeader, StatCard, SectionTitle, Avatar, Pill, TierBadge, TrafficLight } from "@/components/primitives";
import { activity, alerts, goalkeepers, stats, formatRelative, getMentor, computeDutyOverview } from "@/lib/mock-data";
import { useDutySource, useLoggedInteractions } from "@/lib/interactions/use-interactions";

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

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function reportWindow(now = new Date()) {
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  return { from: toLocalIsoDate(from), to: toLocalIsoDate(now) };
}

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
  const reportsWindow = reportWindow();
  const reportsThisWeek = reportsData?.reports.filter((report) => {
    if (!report.match_date) return false;
    const from = new Date(`${reportsWindow.from}T00:00:00`).getTime();
    const to = new Date(`${reportsWindow.to}T23:59:59.999`).getTime();
    const matchDate = new Date(`${report.match_date}T00:00:00`).getTime();
    return Number.isFinite(matchDate) && matchDate >= from && matchDate <= to;
  }).length;
  const reportsSearch = {
    from: reportsWindow.from,
    to: reportsWindow.to,
    coach: "",
    mentorProfileId: "",
    source: "",
    gk: "",
    openSubmit: "",
    last5Gk: "",
    matchDate: "",
    opponent: "",
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


  const pool = goalkeepers;
  const upcoming = [...pool]
    .filter((g) => new Date(g.nextInteraction).getTime() >= Date.now())
    .sort((a, b) => +new Date(a.nextInteraction) - +new Date(b.nextInteraction))
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
          <StatCard label="Total Goalkeepers" value={stats.totalGks} hint="Across all tiers" />
        </Link>
        <Link
          to="/interactions"
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-info/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info"
          aria-label="View upcoming interactions"
        >
          <StatCard
            label="Upcoming Interactions"
            value={stats.upcomingInteractions}
            hint="Next 14 days"
            accent="info"
          />
        </Link>
        <Link
          to="/interactions"
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-destructive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
          aria-label="View overdue interactions"
        >
          <StatCard
            label="Overdue Interactions"
            value={stats.overdueInteractions}
            hint="Action required"
            accent="destructive"
          />
        </Link>
        <Link
          to="/reports"
          search={reportsSearch}
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View match reports"
        >
          <StatCard
            label="Reports This Week"
            value={reportsLoading ? "…" : reportsError || reportsThisWeek == null ? "—" : reportsThisWeek}
            hint={reportsError ? "Report count unavailable" : "Last 7 days"}
            accent="primary"
            emptyMessage="None submitted"
          />
        </Link>
        <Link
          to="/mentors"
          className="block rounded-lg transition-transform hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="View mentors"
        >
          <StatCard label="Active Mentors" value={stats.activeMentors} hint="In rotation" />
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
        <Card className="lg:col-span-2 p-4">
          <SectionTitle>Recent Activity</SectionTitle>
          <div className="space-y-2">
            {recentActivity.length === 0 ? (
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
            <Link to="/mentors" className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-accent/40"><UserCog className="size-4 text-info" /><span className="text-[11px]">Mentors</span></Link>
            <Link to="/reports" className="flex flex-col items-center gap-1 p-2 rounded-md hover:bg-accent/40"><FileText className="size-4 text-warning" /><span className="text-[11px]">Reports</span></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
