import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { PageHeader, Card, Pill } from "@/components/primitives";
import { calendarEvents, formatDate, goalkeepers } from "@/lib/mock-data";
import { useEffect, useState } from "react";
import { withPermission } from "@/components/require-permission";
import { X } from "lucide-react";
import { subscribeMentorSession } from "@/lib/mentor-session-store";
import {
  computeMissingReportTypes,
  shortLabel,
  type TrackedReportType,
} from "@/lib/calendar/missing-report-types";

function MissingReports({
  gkId,
  gkName,
  referenceDate,
  variant,
}: {
  gkId: string;
  gkName?: string;
  referenceDate: Date;
  variant: "compact" | "full";
}) {
  // Re-render when session interactions/reports change.
  const [, setTick] = useState(0);
  useEffect(() => subscribeMentorSession(() => setTick((n) => n + 1)), []);

  const missing: TrackedReportType[] = computeMissingReportTypes(gkId, gkName, {
    referenceDate,
  });
  if (missing.length === 0) return null;

  if (variant === "compact") {
    const shown = missing.slice(0, 3);
    const overflow = missing.length - shown.length;
    return (
      <div
        className="mt-0.5 flex flex-wrap items-center gap-0.5"
        aria-label={`Missing report types: ${missing.join(", ")}`}
      >
        {shown.map((t) => (
          <span
            key={t}
            title={`Missing: ${t} (last 30 days)`}
            className="rounded-sm border border-warning/40 bg-warning/10 px-1 text-[9px] font-mono uppercase leading-tight text-warning"
          >
            {shortLabel(t)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="text-[9px] text-muted-foreground">+{overflow}</span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Missing
      </span>
      {missing.map((t) => (
        <span
          key={t}
          title={`No ${t} logged in last 30 days`}
          className="rounded-sm border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

const calendarSearchSchema = z.object({
  gkId: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/calendar")({
  validateSearch: zodValidator(calendarSearchSchema),
  component: withPermission(CalendarPage, "calendar.view"),
});


const TONE: Record<string, "info" | "warning" | "success" | "muted" | "destructive"> = {
  "Match": "info",
  "Observation": "success",
  "Mentor Visit": "warning",
  "Meeting": "muted",
  "Follow Up": "destructive",
};

function CalendarPage() {
  const { gkId } = Route.useSearch();
  const filteredGoalkeeper = gkId ? goalkeepers.find((g) => g.id === gkId) : null;
  const filteredEvents = gkId ? calendarEvents.filter((e) => e.gkId === gkId) : calendarEvents;

  const [view, setView] = useState<"month" | "week">("month");
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDow = (start.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(today.getFullYear(), today.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = new Map<string, typeof calendarEvents>();
  filteredEvents.forEach((e) => {
    const k = new Date(e.date).toDateString();
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  });


  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
    return d;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description={today.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        action={
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            <button onClick={() => setView("month")} className={`px-3 py-1.5 ${view === "month" ? "bg-accent" : "hover:bg-accent/40"}`}>Month</button>
            <button onClick={() => setView("week")} className={`px-3 py-1.5 ${view === "week" ? "bg-accent" : "hover:bg-accent/40"}`}>Week</button>
          </div>
        }
      />

      {filteredGoalkeeper && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-accent/30 px-3 py-2.5">
          <div className="text-sm">
            <span className="text-muted-foreground">Showing events for</span>{" "}
            <span className="font-medium text-foreground">{filteredGoalkeeper.name}</span>
          </div>
          <Link
            to="/calendar"
            search={{ gkId: "" }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Clear goalkeeper filter for ${filteredGoalkeeper.name}`}
          >
            <X className="size-3.5" /> Reset filter
          </Link>
        </div>
      )}

      {view === "month" ? (

        <Card className="p-3">
          <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              const isToday = d?.toDateString() === today.toDateString();
              const events = d ? eventsByDay.get(d.toDateString()) ?? [] : [];
              return (
                <div key={i} className={`min-h-24 rounded-md border p-1.5 ${d ? "bg-card border-border" : "border-transparent"} ${isToday ? "ring-1 ring-primary" : ""}`}>
                  {d && <div className={`text-[11px] tabular-nums font-mono font-medium mb-1 ${isToday ? "text-primary" : "text-muted-foreground"}`}>{d.getDate()}</div>}
                  <div className="space-y-1">
                    {events.slice(0, 3).map((e) => {
                      const cls = `w-full text-left text-[10px] truncate px-1.5 py-0.5 rounded border ${
                        e.type === "Match" ? "bg-info/15 text-info border-info/30" :
                        e.type === "Observation" ? "bg-success/15 text-success border-success/30" :
                        e.type === "Mentor Visit" ? "bg-warning/15 text-warning border-warning/30" :
                        e.type === "Follow Up" ? "bg-destructive/15 text-destructive border-destructive/30" :
                        "bg-muted text-muted-foreground border-border"
                      }`;
                      if (e.type === "Match" && e.gkId) {
                        const gkForEvent = goalkeepers.find((g) => g.id === e.gkId);
                        const iso = new Date(e.date).toISOString().slice(0, 10);
                        // Title format: "GK vs Opponent" — extract opponent.
                        const opponent = e.title.includes(" vs ") ? e.title.split(" vs ").pop()!.trim() : "";
                        return (
                          <div key={e.id}>
                            <Link
                              to="/reports"
                              search={{ from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: gkForEvent?.name ?? "", openSubmit: "1", last5Gk: "", matchDate: iso, opponent }}
                              className={cls + " hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"}
                              title={`Submit match report for ${e.title} on ${iso}`}
                            >
                              {e.title}
                            </Link>
                            <MissingReports
                              gkId={e.gkId}
                              gkName={gkForEvent?.name}
                              referenceDate={new Date(e.date)}
                              variant="compact"
                            />
                          </div>
                        );
                      }
                      if (e.gkId) {
                        const gkForEvent = goalkeepers.find((g) => g.id === e.gkId);
                        return (
                          <div key={e.id}>
                            <div className={cls}>{e.title}</div>
                            <MissingReports
                              gkId={e.gkId}
                              gkName={gkForEvent?.name}
                              referenceDate={new Date(e.date)}
                              variant="compact"
                            />
                          </div>
                        );
                      }
                      return <div key={e.id} className={cls}>{e.title}</div>;
                    })}
                    {events.length > 3 && <div className="text-[10px] text-muted-foreground">+{events.length - 3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="p-3">
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((d) => {
              const events = eventsByDay.get(d.toDateString()) ?? [];
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div key={d.toISOString()} className={`min-h-72 rounded-md border border-border p-2 ${isToday ? "ring-1 ring-primary" : ""}`}>
                  <div className="text-[10px] uppercase text-muted-foreground">{d.toLocaleDateString("en", { weekday: "short" })}</div>
                  <div className={`text-lg font-semibold tabular-nums font-mono ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
                  <div className="space-y-1.5 mt-2">
                    {events.map((e) => {
                      const gkForEvent = e.gkId ? goalkeepers.find((g) => g.id === e.gkId) : null;
                      const missingSlot = e.gkId ? (
                        <MissingReports
                          gkId={e.gkId}
                          gkName={gkForEvent?.name}
                          referenceDate={new Date(e.date)}
                          variant="full"
                        />
                      ) : null;
                      const inner = (
                        <>
                          <div className="font-medium leading-tight line-clamp-2">{e.title}</div>
                          <div className="mt-1"><Pill tone={TONE[e.type]}>{e.type}</Pill></div>
                          {missingSlot}
                        </>
                      );
                      if (e.type === "Match" && e.gkId) {
                        const iso = new Date(e.date).toISOString().slice(0, 10);
                        const opponent = e.title.includes(" vs ") ? e.title.split(" vs ").pop()!.trim() : "";
                        return (
                          <Link
                            key={e.id}
                            to="/reports"
                            search={{ from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: gkForEvent?.name ?? "", openSubmit: "1", last5Gk: "", matchDate: iso, opponent }}
                            className="block text-[11px] p-1.5 rounded bg-accent/40 border border-border/60 hover:bg-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title={`Submit match report for ${e.title} on ${iso}`}
                          >
                            {inner}
                          </Link>
                        );
                      }
                      return (
                        <div key={e.id} className="text-[11px] p-1.5 rounded bg-accent/40 border border-border/60">
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Upcoming Events</div>
        <div className="divide-y divide-border">
          {filteredEvents.filter((e) => new Date(e.date).getTime() >= Date.now() - 86400000).sort((a, b) => +new Date(a.date) - +new Date(b.date)).slice(0, 10).map((e) => {
            const gkForEvent = e.gkId ? goalkeepers.find((g) => g.id === e.gkId) : null;
            const row = (
              <>
                <div className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums font-mono">{formatDate(e.date)}</div>
                <Pill tone={TONE[e.type]}>{e.type}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{e.title}</div>
                  {e.gkId && (
                    <MissingReports
                      gkId={e.gkId}
                      gkName={gkForEvent?.name}
                      referenceDate={new Date(e.date)}
                      variant="full"
                    />
                  )}
                </div>
              </>
            );
            if (e.type === "Match" && e.gkId) {
              const iso = new Date(e.date).toISOString().slice(0, 10);
              const opponent = e.title.includes(" vs ") ? e.title.split(" vs ").pop()!.trim() : "";
              return (
                <Link
                  key={e.id}
                  to="/reports"
                  search={{ from: "", to: "", coach: "", mentorProfileId: "", source: "", gk: gkForEvent?.name ?? "", openSubmit: "1", last5Gk: "", matchDate: iso, opponent }}
                  className="flex items-start gap-3 py-2 text-sm hover:bg-accent/40 rounded -mx-1 px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title={`Submit match report for ${e.title}`}
                >
                  {row}
                </Link>
              );
            }
            return (
              <div key={e.id} className="flex items-start gap-3 py-2 text-sm">
                {row}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
