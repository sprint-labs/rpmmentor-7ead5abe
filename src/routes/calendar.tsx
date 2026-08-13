import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, Card, Pill } from "@/components/primitives";
import { formatDate, goalkeepers } from "@/lib/mock-data";
import { useEffect, useMemo, useState } from "react";
import { withPermission } from "@/components/require-permission";
import { X, Plus, Pencil, Trash2, NotebookPen } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listAssignableMentors,
  CALENDAR_EVENT_TYPES,
  type TeamCalendarEvent,
} from "@/lib/calendar.functions";
import { listPlayers } from "@/lib/players.functions";
import { listReportCoverage } from "@/lib/calendar/report-coverage.functions";
import {
  missingReportTypes,
  reportCoverageQueryKey,
  shortLabel,
  type GoalkeeperRef,
  type ReportCoverageEntry,
  type TrackedReportType,
} from "@/lib/calendar/report-coverage";

function MissingReports({
  coverage,
  gk,
  eventDate,
  today,
  variant,
}: {
  /**
   * Undefined while the read is in flight or after it has failed. Treating that
   * as "nothing logged" would put the original bug back: five MISSING badges on
   * every goalkeeper, this time whenever the query has not answered yet.
   */
  coverage: readonly ReportCoverageEntry[] | undefined;
  gk: GoalkeeperRef;
  eventDate: string;
  today: string;
  variant: "compact" | "full";
}) {
  if (!coverage) return null;

  const missing: TrackedReportType[] = missingReportTypes(coverage, gk, {
    referenceDate: eventDate,
    today,
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
  new: fallback(z.boolean(), false).default(false),
  /** Wording carried over when a manager escalates a dashboard alert. */
  title: fallback(z.string(), "").default(""),
  notes: fallback(z.string(), "").default(""),
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
  "Other": "muted",
};

const CHIP: Record<string, string> = {
  "Match": "bg-info/15 text-info border-info/30",
  "Observation": "bg-success/15 text-success border-success/30",
  "Mentor Visit": "bg-warning/15 text-warning border-warning/30",
  "Follow Up": "bg-destructive/15 text-destructive border-destructive/30",
  "Meeting": "bg-muted text-muted-foreground border-border",
  "Other": "bg-muted text-muted-foreground border-border",
};

interface DisplayEvent {
  id: string;
  date: string;
  title: string;
  type: string;
  gkId?: string;
  gkName?: string;
  /** Every identifier this event has for its goalkeeper, for coverage matching. */
  gkRef: GoalkeeperRef;
  notes: string;
  location: string | null;
  startTime: string | null;
  assignedMentorName: string;
  createdByName: string;
  raw: TeamCalendarEvent;
}

const emptyDraft = {
  id: "",
  title: "",
  event_type: "Match" as string,
  event_date: new Date().toISOString().slice(0, 10),
  start_time: "",
  location: "",
  notes: "",
  player_id: "",
  assigned_mentor_id: "",
};
type Draft = typeof emptyDraft;

function startTimeLabel(e: DisplayEvent) {
  return e.startTime ? e.startTime.slice(0, 5) : "";
}

/** The calendar date a user is looking at, not a UTC instant. */
function localDateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarPage() {
  const { gkId, new: openNewOnMount, title: prefillTitle, notes: prefillNotes } = Route.useSearch();
  const { can } = useAuth();
  const canManage = can("calendar.manage");
  const [workflow, setWorkflow] = useState<WorkflowKind | null>(null);
  /** Goalkeeper/date carried into Log Interaction when opened from a calendar day or event. */
  const [logPrefill, setLogPrefill] = useState<{ gkId?: string; date?: string }>({});
  const canLog = can("interactions.log");
  function openLog(prefill: { gkId?: string; date?: string } = {}) {
    setLogPrefill(prefill);
    setWorkflow("interaction");
  }
  const queryClient = useQueryClient();

  const fetchEvents = useServerFn(listCalendarEvents);
  const createEvent = useServerFn(createCalendarEvent);
  const editEvent = useServerFn(updateCalendarEvent);
  const removeEvent = useServerFn(deleteCalendarEvent);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => fetchEvents(),
  });

  // What has actually been logged, for the missing-report badges. Deliberately
  // left undefined until it resolves; see MissingReports.
  const fetchCoverage = useServerFn(listReportCoverage);
  const { data: coverage } = useQuery({
    queryKey: reportCoverageQueryKey,
    queryFn: () => fetchCoverage(),
    staleTime: 60_000,
  });

  // A queued report can reach the server while this page is open — the offline
  // queue drains in the background and only announces itself as a window event.
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: reportCoverageQueryKey });
    };
    window.addEventListener("rpm:report-submitted", invalidate);
    return () => window.removeEventListener("rpm:report-submitted", invalidate);
  }, [queryClient]);

  // Scheduling an event needs the canonical roster and the assignable profiles.
  // Only managers can open the form, so neither list is fetched for anyone else.
  const fetchRoster = useServerFn(listPlayers);
  const { data: roster = [] } = useQuery({
    queryKey: ["players", "roster"],
    queryFn: () => fetchRoster(),
    staleTime: 5 * 60_000,
    enabled: canManage,
  });
  const fetchMentors = useServerFn(listAssignableMentors);
  const { data: assignableMentors = [] } = useQuery({
    queryKey: ["calendar", "assignable-mentors"],
    queryFn: () => fetchMentors(),
    staleTime: 5 * 60_000,
    enabled: canManage,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredGoalkeeper = gkId ? goalkeepers.find((g) => g.id === gkId) : null;

  const displayEvents: DisplayEvent[] = useMemo(() => {
    const mapped = events.map((e) => {
      const gk = e.goalkeeper_name
        ? goalkeepers.find((g) => g.name.toLowerCase() === e.goalkeeper_name!.toLowerCase())
        : undefined;
      return {
        id: e.id,
        date: e.event_date,
        title: e.title,
        type: e.event_type,
        gkId: gk?.id,
        gkName: e.goalkeeper_name ?? gk?.name,
        gkRef: {
          playerId: e.player_id,
          gkSlug: gk?.id ?? null,
          name: e.goalkeeper_name ?? gk?.name ?? null,
        },
        notes: e.notes,
        location: e.location,
        startTime: e.start_time,
        assignedMentorName: e.assigned_mentor_name,
        createdByName: e.created_by_name,
        raw: e,
      } satisfies DisplayEvent;
    });
    return filteredGoalkeeper ? mapped.filter((e) => e.gkId === filteredGoalkeeper.id) : mapped;
  }, [events, filteredGoalkeeper]);

  const [view, setView] = useState<"month" | "week">("month");
  const today = new Date();
  const todayIso = localDateIso(today);
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDow = (start.getDay() + 6) % 7; // Mon = 0
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(today.getFullYear(), today.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDay = new Map<string, DisplayEvent[]>();
  displayEvents.forEach((e) => {
    const k = new Date(`${e.date}T00:00:00`).toDateString();
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k)!.push(e);
  });

  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + i);
    return d;
  });

  function openNew(dateIso?: string) {
    setDraft({ ...emptyDraft, event_date: dateIso ?? emptyDraft.event_date });
  }

  // Deep link from dashboard quick actions: /calendar?new=true
  useEffect(() => {
    if (openNewOnMount && canManage) {
      setDraft({
        ...emptyDraft,
        ...(prefillTitle ? { title: prefillTitle, event_type: "Follow Up" } : {}),
        ...(prefillNotes ? { notes: prefillNotes } : {}),
      });
    }
  }, [openNewOnMount, canManage, prefillTitle, prefillNotes]);

  function openEdit(e: DisplayEvent) {
    setDraft({
      id: e.id,
      title: e.title,
      event_type: e.type,
      event_date: e.date,
      start_time: e.startTime?.slice(0, 5) ?? "",
      location: e.location ?? "",
      notes: e.notes,
      player_id: e.raw.player_id ?? "",
      assigned_mentor_id: e.raw.assigned_mentor_id ?? "",
    });
  }

  async function saveDraft() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Add a title for this event.");
      return;
    }
    if (!draft.event_date) {
      toast.error("Pick a date for this event.");
      return;
    }
    if (!draft.player_id) {
      toast.error("Choose the goalkeeper this event is about.");
      return;
    }
    if (!draft.assigned_mentor_id) {
      toast.error("Choose the mentor attending this event.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title,
        event_type: draft.event_type,
        event_date: draft.event_date,
        start_time: draft.start_time,
        location: draft.location,
        notes: draft.notes,
        player_id: draft.player_id,
        assigned_mentor_id: draft.assigned_mentor_id,
      };
      if (draft.id) await editEvent({ data: { id: draft.id, ...payload } });
      else await createEvent({ data: payload });
      await queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success(draft.id ? "Calendar event updated" : "Calendar event added");
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the event.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this event from the shared calendar?")) return;
    try {
      await removeEvent({ data: { id } });
      await queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast.success("Calendar event removed");
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the event.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Calendar"
        description={today.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
        action={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              <button onClick={() => setView("month")} className={`px-3 py-1.5 ${view === "month" ? "bg-accent" : "hover:bg-accent/40"}`}>Month</button>
              <button onClick={() => setView("week")} className={`px-3 py-1.5 ${view === "week" ? "bg-accent" : "hover:bg-accent/40"}`}>Week</button>
            </div>
            {can("interactions.log") && (
              <button
                onClick={() => openLog(gkId ? { gkId } : {})}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3.5" /> Log interaction
              </button>
            )}
            {canManage && (
              <button
                onClick={() => openNew()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3.5" /> Add event
              </button>
            )}
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
              const dayEvents = d ? eventsByDay.get(d.toDateString()) ?? [] : [];
              const iso = d ? localDateIso(d) : "";
              return (
                <div key={i} className={`group min-h-24 rounded-md border p-1.5 ${d ? "bg-card border-border" : "border-transparent"} ${isToday ? "ring-1 ring-primary" : ""}`}>
                  {d && (
                    <div className="mb-1 flex items-center justify-between">
                      <span className={`text-[11px] tabular-nums font-mono font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>{d.getDate()}</span>
                      <span className="flex items-center gap-0.5">
                        {canLog && (
                          <button
                            onClick={() => openLog({ date: iso, gkId: gkId || undefined })}
                            aria-label={`Log interaction on ${iso}`}
                            title="Log interaction"
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <NotebookPen className="size-3" />
                          </button>
                        )}
                        {canManage && (
                          <button
                            onClick={() => openNew(iso)}
                            aria-label={`Add event on ${iso}`}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded p-0.5 text-muted-foreground hover:text-foreground"
                          >
                            <Plus className="size-3" />
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e) => {
                      const cls = `w-full text-left text-[10px] truncate px-1.5 py-0.5 rounded border ${CHIP[e.type] ?? CHIP["Other"]}`;
                      const label = startTimeLabel(e) ? `${startTimeLabel(e)} ${e.title}` : e.title;
                      return (
                        <div key={e.id}>
                          {canManage ? (
                            <button
                              onClick={() => openEdit(e)}
                              className={cls + " hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"}
                              title={e.notes || e.title}
                            >
                              {label}
                            </button>
                          ) : (
                            <div className={cls} title={e.notes || e.title}>{label}</div>
                          )}
                          <MissingReports
                            coverage={coverage}
                            gk={e.gkRef}
                            eventDate={e.date}
                            today={todayIso}
                            variant="compact"
                          />
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</div>}
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
              const dayEvents = eventsByDay.get(d.toDateString()) ?? [];
              const isToday = d.toDateString() === today.toDateString();
              return (
                <div key={d.toISOString()} className={`min-h-72 rounded-md border border-border p-2 ${isToday ? "ring-1 ring-primary" : ""}`}>
                  <div className="text-[10px] uppercase text-muted-foreground">{d.toLocaleDateString("en", { weekday: "short" })}</div>
                  <div className={`text-lg font-semibold tabular-nums font-mono ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
                  <div className="space-y-1.5 mt-2">
                    {dayEvents.map((e) => (
                      <div key={e.id} className="text-[11px] p-1.5 rounded bg-accent/40 border border-border/60">
                        <div className="font-medium leading-tight line-clamp-2">{e.title}</div>
                        {startTimeLabel(e) && <div className="text-[10px] text-muted-foreground tabular-nums font-mono">{startTimeLabel(e)}</div>}
                        <div className="mt-1"><Pill tone={TONE[e.type] ?? "muted"}>{e.type}</Pill></div>
                        {e.notes && <div className="mt-1 text-[10px] text-muted-foreground line-clamp-3">{e.notes}</div>}
                        <MissingReports
                          coverage={coverage}
                          gk={e.gkRef}
                          eventDate={e.date}
                          today={todayIso}
                          variant="full"
                        />
                        <div className="mt-1 flex items-center gap-2">
                          {canLog && (
                            <button onClick={() => openLog({ date: e.date, gkId: e.gkId })} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                              <NotebookPen className="size-3" /> Log
                            </button>
                          )}
                          {canManage && (
                            <button onClick={() => openEdit(e)} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                              <Pencil className="size-3" /> Edit
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">Upcoming Events</div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading calendar…</div>
        ) : (
          <div className="divide-y divide-border">
            {displayEvents
              .filter((e) => new Date(`${e.date}T00:00:00`).getTime() >= Date.now() - 86400000)
              .slice(0, 10)
              .map((e) => (
                <div key={e.id} className="flex items-start gap-3 py-2 text-sm">
                  <div className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums font-mono">{formatDate(e.date)}</div>
                  <Pill tone={TONE[e.type] ?? "muted"}>{e.type}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        startTimeLabel(e),
                        e.location,
                        e.gkName,
                        e.assignedMentorName && `${e.assignedMentorName} attending`,
                        e.createdByName && `added by ${e.createdByName}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {e.notes && <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{e.notes}</div>}
                    <MissingReports
                      coverage={coverage}
                      gk={e.gkRef}
                      eventDate={e.date}
                      today={todayIso}
                      variant="full"
                    />
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => openEdit(e)} aria-label={`Edit ${e.title}`} className="rounded p-1 text-muted-foreground hover:text-foreground">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} aria-label={`Delete ${e.title}`} className="rounded p-1 text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            {displayEvents.filter((e) => new Date(`${e.date}T00:00:00`).getTime() >= Date.now() - 86400000).length === 0 && (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled yet.
                {canManage && " Use “Add event” to book a mentor in to see a goalkeeper."}
              </div>
            )}
          </div>
        )}
      </Card>

      {draft && canManage && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="mt-8 w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {draft.id ? "Edit event" : "Add calendar event"}
              </h2>
              <button onClick={() => setDraft(null)} aria-label="Close" className="rounded p-1 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Title</span>
                <input
                  value={draft.title}
                  onChange={(ev) => setDraft({ ...draft, title: ev.target.value })}
                  maxLength={160}
                  placeholder="e.g. Watford v Luton — attending"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Type</span>
                  <select
                    value={draft.event_type}
                    onChange={(ev) => setDraft({ ...draft, event_type: ev.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                  >
                    {CALENDAR_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Date</span>
                  <input
                    type="date"
                    value={draft.event_date}
                    onChange={(ev) => setDraft({ ...draft, event_date: ev.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">Start (optional)</span>
                  <input
                    type="time"
                    value={draft.start_time}
                    onChange={(ev) => setDraft({ ...draft, start_time: ev.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Goalkeeper</span>
                <select
                  value={draft.player_id}
                  onChange={(ev) => setDraft({ ...draft, player_id: ev.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                >
                  <option value="">Choose a goalkeeper…</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Mentor attending</span>
                <select
                  value={draft.assigned_mentor_id}
                  onChange={(ev) => setDraft({ ...draft, assigned_mentor_id: ev.target.value })}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                >
                  <option value="">Choose a mentor…</option>
                  {assignableMentors.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  This event will appear on their home page.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Location (optional)</span>
                <input
                  value={draft.location}
                  onChange={(ev) => setDraft({ ...draft, location: ev.target.value })}
                  maxLength={160}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Notes (free text)</span>
                <textarea
                  value={draft.notes}
                  onChange={(ev) => setDraft({ ...draft, notes: ev.target.value })}
                  rows={4}
                  maxLength={4000}
                  placeholder="Anything the team should know — travel, agenda, who's attending…"
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              {draft.id ? (
                <button
                  onClick={() => handleDelete(draft.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={() => setDraft(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button>
                <button
                  onClick={saveDraft}
                  disabled={saving}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-60"
                >
                  {saving ? "Saving…" : draft.id ? "Save changes" : "Add event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <WorkflowDialog
        kind={workflow}
        onClose={() => { setWorkflow(null); setLogPrefill({}); }}
        prefillGkId={logPrefill.gkId}
        prefillMatchDate={logPrefill.date}
      />
    </div>
  );
}
