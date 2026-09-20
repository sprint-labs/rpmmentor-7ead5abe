import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { stripFixtureDuplicateKey } from "@/lib/calendar/fixture-import/fields";
import { eventSummaryLine } from "@/lib/calendar/event-summary";
import { hasActiveEventFilters, matchesEventFilters } from "@/lib/calendar/event-filters";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader, Card, Pill } from "@/components/primitives";
import { formatDate, goalkeepers } from "@/lib/mock-data";
import { useEffect, useMemo, useRef, useState } from "react";
import { withPermission } from "@/components/require-permission";
import {
  X,
  Search,
  Plus,
  Pencil,
  Trash2,
  NotebookPen,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { WorkflowDialog, type WorkflowKind } from "@/components/workflows";
import { FixtureImportDialog } from "@/components/calendar/fixture-import-dialog";
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  updateMatchParticipation,
  deleteCalendarEvent,
  listAssignableMentors,
  CALENDAR_EVENT_TYPES,
  type TeamCalendarEvent,
} from "@/lib/calendar.functions";
import { listPlayers } from "@/lib/players.functions";
import {
  formatMonthParam,
  isSameMonth,
  localDateIso,
  monthGrid,
  monthLabel,
  monthOf,
  parseMonthParam,
  shiftMonth,
} from "@/lib/calendar/month";
import {
  cancelCalendarEvent,
  listEventFollowUps,
  reinstateCalendarEvent,
  reinstateEventFollowUp,
  waiveEventFollowUp,
} from "@/lib/events/follow-up.functions";
import { eventFollowUpsQueryKey } from "@/lib/events/query-keys";
import { notificationsQueryKey } from "@/lib/events/query-keys";
import {
  isEventType,
  FOLLOW_UP_KIND_BY_EVENT_TYPE,
  followUpRequirementLabel,
} from "@/lib/events/follow-up";
import { cancellationFeedback } from "@/lib/events/notification-copy";
import {
  FollowUpActionLink,
  FollowUpStatusPill,
  followUpDetail,
  unwaivePresentation,
} from "@/components/events/follow-up-status";
import { MatchParticipationControl } from "@/components/events/match-participation-control";
import {
  MATCH_PARTICIPATION_STATUS_LABEL,
  type MatchParticipationStatus,
} from "@/lib/events/participation";

const calendarSearchSchema = z.object({
  gkId: fallback(z.string(), "").default(""),
  new: fallback(z.boolean(), false).default(false),
  /** Wording carried over when a manager escalates a dashboard alert. */
  title: fallback(z.string(), "").default(""),
  notes: fallback(z.string(), "").default(""),
  /**
   * Month to open on, `YYYY-MM`. Empty means "the month containing today",
   * which is what every existing link to this page already expects, so adding
   * the parameter leaves those links behaving exactly as before.
   */
  month: fallback(z.string(), "").default(""),
  /** "" is every event, which is how this page has always opened. */
  kind: fallback(z.enum(["", "fixtures", "interactions"]), "").default(""),
  /**
   * Free-text narrowing, in the URL for the same reason as `kind`: a narrowed
   * calendar can be linked to and survives a reload. All three are plain
   * "contains" matches that narrow as they are typed.
   */
  gkq: fallback(z.string(), "").default(""),
  team: fallback(z.string(), "").default(""),
  comp: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/calendar")({
  validateSearch: zodValidator(calendarSearchSchema),
  component: withPermission(CalendarPage, "calendar.view"),
});

/** The calendar's kind filter, in tab order. */
const KIND_FILTERS = [
  { id: "" as const, label: "All" },
  { id: "fixtures" as const, label: "Fixtures" },
  { id: "interactions" as const, label: "Interactions" },
];

/** The one event type that is a fixture; everything else is contact work. */
const FIXTURE_EVENT_TYPE = "Match";

function isFixtureEvent(eventType: string): boolean {
  return eventType === FIXTURE_EVENT_TYPE;
}

/**
 * What an event's colour says.
 *
 * Colour used to encode the event type, which meant eight types competing for
 * five hues and told a reader nothing they could not already read in the label
 * beside it. It now answers the question the calendar is actually scanned for:
 *
 *   blue    contact work — a visit, a catch-up, a call
 *   green   a fixture where the goalkeeper is confirmed to have played
 *   amber   a fixture where that is still unconfirmed, or they did not play
 *
 * So amber on this page means "somebody needs to confirm this", and it clears
 * itself the moment participation is recorded.
 */
function eventTone(
  eventType: string,
  participation: MatchParticipationStatus,
): "info" | "success" | "warning" {
  if (!isFixtureEvent(eventType)) return "info";
  return participation === "played" ? "success" : "warning";
}

const CHIP: Record<"info" | "success" | "warning", string> = {
  info: "bg-info/15 text-info border-info/30",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning border-warning/30",
};

interface DisplayEvent {
  id: string;
  date: string;
  title: string;
  type: string;
  gkId?: string;
  gkName?: string;
  notes: string;
  /**
   * `notes` with the fixture-import marker taken out, for anything a person
   * reads. `notes` itself stays raw so the editor saves the marker back.
   */
  displayNotes: string;
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

/** What the chosen type will ask the assigned mentor for. */
function followUpHint(eventType: string): string {
  if (!isEventType(eventType)) return "Retired type — reclassify to save this event.";
  const kind = FOLLOW_UP_KIND_BY_EVENT_TYPE[eventType];
  return `Needs a ${followUpRequirementLabel(kind)} within 48 hours.`;
}

function CalendarPage() {
  const {
    gkId,
    gkq,
    team: teamFilter,
    comp: compFilter,
    new: openNewOnMount,
    title: prefillTitle,
    notes: prefillNotes,
    month: monthParam,
    kind: kindFilter,
  } = Route.useSearch();
  const navigate = useNavigate();
  const { can, user } = useAuth();
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
  const setMatchParticipation = useServerFn(updateMatchParticipation);
  const removeEvent = useServerFn(deleteCalendarEvent);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["calendar-events"],
    queryFn: () => fetchEvents(),
  });

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

  // Where each event's write-up stands. Read from the database on every load, so
  // a status is never a stale copy of what was true when the page opened.
  const fetchFollowUps = useServerFn(listEventFollowUps);
  const { data: followUpData } = useQuery({
    queryKey: eventFollowUpsQueryKey,
    queryFn: () => fetchFollowUps(),
    staleTime: 30_000,
  });
  const followUpByEvent = useMemo(
    () => new Map((followUpData?.rows ?? []).map((r) => [r.eventId, r])),
    [followUpData],
  );

  const cancelEvent = useServerFn(cancelCalendarEvent);
  const reinstateEvent = useServerFn(reinstateCalendarEvent);
  const waiveFollowUp = useServerFn(waiveEventFollowUp);
  const unwaiveFollowUp = useServerFn(reinstateEventFollowUp);

  const [draft, setDraft] = useState<Draft | null>(null);
  /**
   * The event being read rather than edited. Someone without
   * `calendar.manage` had no way to see what an entry actually held: the chip
   * was a plain div, and its detail lived only in a `title` tooltip.
   */
  const [viewing, setViewing] = useState<DisplayEvent | null>(null);
  const viewingDialogRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [participationSaving, setParticipationSaving] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  async function refreshEvents() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] }),
      queryClient.invalidateQueries({ queryKey: eventFollowUpsQueryKey }),
    ]);
  }

  async function handleParticipation(
    event: DisplayEvent,
    participationStatus: TeamCalendarEvent["participation_status"],
  ) {
    if (event.raw.participation_status === participationStatus) return;
    setParticipationSaving(event.id);
    try {
      await setMatchParticipation({
        data: { id: event.id, participation_status: participationStatus },
      });
      await Promise.all([
        refreshEvents(),
        queryClient.invalidateQueries({
          queryKey: notificationsQueryKey(user?.id ?? "anonymous"),
        }),
      ]);
      toast.success(
        `${event.gkName || "Goalkeeper"}: ${MATCH_PARTICIPATION_STATUS_LABEL[participationStatus]}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update participation.");
    } finally {
      setParticipationSaving(null);
    }
  }

  /** Cancel an event, keeping it on the record with the reason attached. */
  async function handleCancel(id: string) {
    const reason = window.prompt("Why is this event cancelled? (optional)");
    if (reason === null) return;
    try {
      const result = await cancelEvent({ data: { id, reason } });
      await refreshEvents();
      const feedback = cancellationFeedback(result.notification);
      toast[feedback.level](feedback.message);
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the event.");
    }
  }

  async function handleReinstate(id: string) {
    try {
      await reinstateEvent({ data: { id } });
      await refreshEvents();
      toast.success("Event reinstated.");
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reinstate the event.");
    }
  }

  /** Waive the write-up. A reason is required, and is kept for review. */
  async function handleWaive(id: string) {
    const reason = window.prompt("Why is no write-up required? (required)");
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error("A reason is required to waive a write-up.");
      return;
    }
    try {
      await waiveFollowUp({ data: { id, reason } });
      await refreshEvents();
      toast.success("Marked as not required.");
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not waive the follow-up.");
    }
  }

  async function handleUnwaive(id: string, successMessage: string) {
    try {
      await unwaiveFollowUp({ data: { id } });
      await refreshEvents();
      toast.success(successMessage);
      setDraft(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reinstate the follow-up.");
    }
  }

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
        notes: e.notes,
        displayNotes: stripFixtureDuplicateKey(e.notes ?? ""),
        location: e.location,
        startTime: e.start_time,
        assignedMentorName: e.assigned_mentor_name,
        createdByName: e.created_by_name,
        raw: e,
      } satisfies DisplayEvent;
    });
    const forGoalkeeper = filteredGoalkeeper
      ? mapped.filter((e) => e.gkId === filteredGoalkeeper.id)
      : mapped;
    const byKind = kindFilter
      ? forGoalkeeper.filter((e) => isFixtureEvent(e.type) === (kindFilter === "fixtures"))
      : forGoalkeeper;
    const typed = { goalkeeper: gkq, team: teamFilter, competition: compFilter };
    if (!hasActiveEventFilters(typed)) return byKind;
    return byKind.filter((e) => matchesEventFilters(e, typed));
  }, [events, filteredGoalkeeper, kindFilter, gkq, teamFilter, compFilter]);

  const [view, setView] = useState<"month" | "week">("month");
  const today = new Date();
  const todayIso = localDateIso(today);
  const todayMonth = monthOf(today);
  // The month on screen comes from the URL, so a link can open a specific one
  // and the browser's back button steps between months. An absent or malformed
  // value falls back to today's month, which is how this page always behaved.
  const monthCursor = parseMonthParam(monthParam, todayMonth);
  const cells = monthGrid(monthCursor);

  function goToMonth(next: { year: number; month: number }) {
    void navigate({
      to: "/calendar",
      search: (prev) => ({ ...prev, month: formatMonthParam(next) }),
      replace: true,
    });
  }

  // Keyed by local calendar date. Keying on `Date.toDateString()` meant
  // building a Date per row and per lookup, when the ISO day is already the
  // value the rows carry.
  const eventsByDay = new Map<string, DisplayEvent[]>();
  displayEvents.forEach((e) => {
    const k = e.date.slice(0, 10);
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

  // Deep link from dashboard quick actions: /calendar?new=true. The type is left
  // at its default rather than guessed from the wording — the manager chooses,
  // because the choice decides which write-up the mentor will owe.
  useEffect(() => {
    if (openNewOnMount && canManage) {
      setDraft({
        ...emptyDraft,
        ...(prefillTitle ? { title: prefillTitle } : {}),
        ...(prefillNotes ? { notes: prefillNotes } : {}),
      });
    }
  }, [openNewOnMount, canManage, prefillTitle, prefillNotes]);

  useEffect(() => {
    if (!viewing) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = viewingDialogRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
    dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setViewing(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => !element.hasAttribute("hidden"),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [viewing]);

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
    if (!draft.start_time) {
      toast.error("Set a start time — the follow-up deadline is measured from it.");
      return;
    }
    if (!isEventType(draft.event_type)) {
      toast.error("Choose Match, Training Ground Visit or Coffee Catch-up.");
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
      await refreshEvents();
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
      await refreshEvents();
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
              <button
                onClick={() => setView("month")}
                className={`px-3 py-1.5 ${view === "month" ? "bg-accent" : "hover:bg-accent/40"}`}
              >
                Month
              </button>
              <button
                onClick={() => setView("week")}
                className={`px-3 py-1.5 ${view === "week" ? "bg-accent" : "hover:bg-accent/40"}`}
              >
                Week
              </button>
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
              <>
                <button
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Upload className="size-3.5" /> Import fixtures
                </button>
                <button
                  onClick={() => openNew()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="size-3.5" /> Add event
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Fixtures or contact work. A search parameter rather than component
          state so the choice survives a reload and can be linked to, the same
          as the goalkeeper filter below it. */}
      <div
        role="group"
        aria-label="Filter events by kind"
        className="inline-flex gap-1 rounded-md border border-border p-0.5"
      >
        {KIND_FILTERS.map((option) => {
          const selected = kindFilter === option.id;
          return (
            <Link
              key={option.id || "all"}
              to="/calendar"
              search={(prev) => ({ ...prev, kind: option.id })}
              replace
              aria-current={selected ? "true" : undefined}
              className={`min-h-9 rounded px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </div>

      {/* Three plain search bars. No dropdown opens and nothing is chosen from
          a list: the calendar and the events under it narrow on each keystroke,
          which is faster than picking when you already know the name. */}
      <div className="grid gap-2 sm:grid-cols-3">
        {(
          [
            { key: "gkq", label: "Goalkeeper", value: gkq },
            { key: "team", label: "Team", value: teamFilter },
            { key: "comp", label: "Competition", value: compFilter },
          ] as const
        ).map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              {field.label}
            </span>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={field.value}
                placeholder={`Filter by ${field.label.toLowerCase()}`}
                onChange={(ev) => {
                  const next = ev.target.value;
                  void navigate({
                    to: "/calendar",
                    search: (prev) => ({ ...prev, [field.key]: next }),
                    replace: true,
                  });
                }}
                className="min-h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </label>
        ))}
      </div>

      {hasActiveEventFilters({ goalkeeper: gkq, team: teamFilter, competition: compFilter }) && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-accent/30 px-3 py-2.5">
          <div className="text-xs text-muted-foreground">
            Showing {displayEvents.length} matching{" "}
            {displayEvents.length === 1 ? "event" : "events"}
          </div>
          <Link
            to="/calendar"
            search={(prev) => ({ ...prev, gkq: "", team: "", comp: "" })}
            replace
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3.5" /> Clear filters
          </Link>
        </div>
      )}

      {/* What the colours mean. The grid tells you at a glance which fixtures
          are still waiting on a result, which is the whole point of the tone —
          but only if the tone is explained somewhere. */}
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground"
        aria-label="Colour key"
      >
        {[
          { tone: "success" as const, label: "Fixture played" },
          { tone: "warning" as const, label: "Fixture to come" },
          { tone: "info" as const, label: "Interaction or visit" },
        ].map((entry) => (
          <span key={entry.tone} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-2.5 rounded-sm border ${CHIP[entry.tone]}`}
            />
            {entry.label}
          </span>
        ))}
      </div>

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
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => goToMonth(shiftMonth(monthCursor, -1))}
              aria-label={`Show ${monthLabel(shiftMonth(monthCursor, -1))}`}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="flex items-center gap-2">
              <h2
                className="font-mono text-sm font-bold uppercase tracking-[0.14em]"
                aria-live="polite"
              >
                {monthLabel(monthCursor)}
              </h2>
              {!isSameMonth(monthCursor, todayMonth) && (
                <button
                  type="button"
                  onClick={() => goToMonth(todayMonth)}
                  className="rounded border border-border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Today
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => goToMonth(shiftMonth(monthCursor, 1))}
              aria-label={`Show ${monthLabel(shiftMonth(monthCursor, 1))}`}
              className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="px-2 py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell) => {
              const isToday = cell.iso === todayIso;
              // Adjacent-month days are shown greyed for alignment but carry no
              // events, so a fixture is never listed under two months.
              const dayEvents = cell.inMonth ? (eventsByDay.get(cell.iso) ?? []) : [];
              const iso = cell.iso;
              return (
                <div
                  key={cell.iso}
                  className={`group min-h-24 rounded-md border p-1.5 ${cell.inMonth ? "bg-card border-border" : "border-transparent opacity-40"} ${isToday ? "ring-1 ring-primary" : ""}`}
                >
                  {cell.inMonth ? (
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className={`text-[11px] tabular-nums font-mono font-medium ${isToday ? "text-primary-ink" : "text-muted-foreground"}`}
                      >
                        {cell.day}
                      </span>
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
                  ) : (
                    <div className="mb-1">
                      <span className="text-[11px] tabular-nums font-mono font-medium text-muted-foreground">
                        {cell.day}
                      </span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((e) => {
                      const cls = `w-full text-left text-[10px] truncate px-1.5 py-0.5 rounded border ${CHIP[eventTone(e.type, e.raw.participation_status)]}`;
                      const label = startTimeLabel(e) ? `${startTimeLabel(e)} ${e.title}` : e.title;
                      return (
                        <div key={e.id}>
                          <button
                            onClick={() => (canManage ? openEdit(e) : setViewing(e))}
                            className={
                              cls +
                              " hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            }
                            title={e.displayNotes || e.title}
                          >
                            {label}
                          </button>
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{dayEvents.length - 3}
                      </div>
                    )}
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
              // Keyed by the same local ISO day the map is built on. This read
              // still asked for `toDateString()` after the map moved to ISO
              // keys, so every lookup missed and the week showed no events at
              // all — the month view beside it was right the whole time.
              const iso = localDateIso(d);
              const dayEvents = eventsByDay.get(iso) ?? [];
              const isToday = iso === todayIso;
              return (
                <div
                  key={d.toISOString()}
                  className={`min-h-40 rounded-md border border-border p-2 ${isToday ? "ring-1 ring-primary" : ""}`}
                >
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {d.toLocaleDateString("en", { weekday: "short" })}
                  </div>
                  <div
                    className={`text-lg font-semibold tabular-nums font-mono ${isToday ? "text-primary-ink" : ""}`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="space-y-1.5 mt-2">
                    {dayEvents.map((e) => (
                      <div
                        key={e.id}
                        className="text-[11px] p-1.5 rounded bg-accent/40 border border-border/60"
                      >
                        <div className="font-medium leading-tight line-clamp-2">{e.title}</div>
                        {startTimeLabel(e) && (
                          <div className="text-[10px] text-muted-foreground tabular-nums font-mono">
                            {startTimeLabel(e)}
                          </div>
                        )}
                        <div className="mt-1">
                          <Pill tone={eventTone(e.type, e.raw.participation_status)}>{e.type}</Pill>
                        </div>
                        {e.displayNotes && (
                          <div className="mt-1 text-[10px] text-muted-foreground line-clamp-3">
                            {e.displayNotes}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          {canLog && (
                            <button
                              onClick={() => openLog({ date: e.date, gkId: e.gkId })}
                              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              <NotebookPen className="size-3" /> Log
                            </button>
                          )}
                          {canManage && (
                            <button
                              onClick={() => openEdit(e)}
                              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                            >
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
        <div className="text-sm font-semibold mb-3 uppercase tracking-wider text-muted-foreground">
          Upcoming Events
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading calendar…</div>
        ) : (
          <div className="divide-y divide-border">
            {displayEvents
              .filter((e) => new Date(`${e.date}T00:00:00`).getTime() >= Date.now() - 86400000)
              .slice(0, 10)
              .map((e) => (
                <div key={e.id} className="flex items-start gap-3 py-2 text-sm">
                  <div className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums font-mono">
                    {formatDate(e.date)}
                  </div>
                  <Pill tone={eventTone(e.type, e.raw.participation_status)}>{e.type}</Pill>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{e.title}</div>
                    {/* A fixture's title already names both teams, and the
                        control below says whether the goalkeeper is starting,
                        so this line carries only what neither of them does.
                        Who added the row is not something a reader of the
                        schedule needs, and it printed whatever the creator's
                        profile was called on the day it was saved. */}
                    <div className="text-xs text-muted-foreground">
                      {eventSummaryLine({
                        type: e.type,
                        startTimeLabel: startTimeLabel(e),
                        location: e.location,
                        goalkeeperName: e.gkName,
                        mentorAttendingName: e.assignedMentorName,
                      })}
                    </div>
                    {e.type === "Match" &&
                      (canManage ? (
                        <div className="mt-1.5">
                          <MatchParticipationControl
                            status={e.raw.participation_status}
                            disabled={participationSaving === e.id}
                            label={`Participation — ${e.gkName || "goalkeeper"}`}
                            onChange={(status) => handleParticipation(e, status)}
                          />
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Participation:{" "}
                          {MATCH_PARTICIPATION_STATUS_LABEL[e.raw.participation_status]}
                        </div>
                      ))}
                    {e.displayNotes && e.type !== "Match" && (
                      <div className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                        {e.displayNotes}
                      </div>
                    )}
                    {(() => {
                      const row = followUpByEvent.get(e.id);
                      if (
                        !row ||
                        (!row.followUp.kind && row.followUp.status !== "confirmation_needed")
                      ) {
                        return null;
                      }
                      return (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <FollowUpStatusPill status={row.followUp.status} />
                          <span className="text-[11px] text-muted-foreground">
                            {followUpDetail(row.followUp, row.waiverReason, row.cancellationReason)}
                          </span>
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
                            canConfirmParticipation={canManage}
                          />
                        </div>
                      );
                    })()}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => openEdit(e)}
                        aria-label={`Edit ${e.title}`}
                        className="rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        aria-label={`Delete ${e.title}`}
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            {displayEvents.filter(
              (e) => new Date(`${e.date}T00:00:00`).getTime() >= Date.now() - 86400000,
            ).length === 0 && (
              <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled yet.
                {canManage && " Use “Add event” to book a mentor in to see a goalkeeper."}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Read-only detail, for everyone who cannot edit. It prints the same
          fields the form captures, so an entry answers itself rather than
          hiding what it holds behind a tooltip. */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setViewing(null)}
        >
          <div
            ref={viewingDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-detail-title"
            className="mt-8 w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="calendar-event-detail-title"
                  className="text-sm font-semibold uppercase tracking-wider"
                >
                  {viewing.title}
                </h2>
                <div className="mt-1">
                  <Pill tone={eventTone(viewing.type, viewing.raw.participation_status)}>
                    {viewing.type}
                  </Pill>
                </div>
              </div>
              <button
                onClick={() => setViewing(null)}
                aria-label="Close"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <dl className="space-y-2.5 text-sm">
              {[
                { label: "Date", value: formatDate(viewing.date) },
                { label: "Kick-off", value: startTimeLabel(viewing) },
                { label: "Goalkeeper", value: viewing.gkName },
                {
                  label: "Participation",
                  value:
                    viewing.type === "Match"
                      ? MATCH_PARTICIPATION_STATUS_LABEL[viewing.raw.participation_status]
                      : "",
                },
                { label: "Mentor attending", value: viewing.assignedMentorName },
                { label: "Location", value: viewing.location },
                { label: "Notes", value: viewing.displayNotes },
              ]
                .filter((row) => Boolean(row.value))
                .map((row) => (
                  <div key={row.label} className="flex gap-3">
                    <dt className="w-32 shrink-0 text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 flex-1 whitespace-pre-wrap">{row.value}</dd>
                  </div>
                ))}
            </dl>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setViewing(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {draft && canManage && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm">
          <div className="mt-8 w-full max-w-lg rounded-lg border border-border bg-card p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                {draft.id ? "Edit event" : "Add calendar event"}
              </h2>
              <button
                onClick={() => setDraft(null)}
                aria-label="Close"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
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
                    {/* An event stored under a retired type keeps showing it, so
                        the manager can see what needs reclassifying rather than
                        having it silently swapped for something else. */}
                    {!isEventType(draft.event_type) && draft.event_type && (
                      <option value={draft.event_type}>
                        {draft.event_type} (retired — please reclassify)
                      </option>
                    )}
                    {CALENDAR_EVENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {followUpHint(draft.event_type)}
                  </span>
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
                  <span className="mb-1 block text-xs text-muted-foreground">Start time</span>
                  <input
                    type="time"
                    value={draft.start_time}
                    onChange={(ev) => setDraft({ ...draft, start_time: ev.target.value })}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5"
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    London time. The 48-hour deadline runs from here.
                  </span>
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
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
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
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  This event will appear on their home page.
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Location (optional)
                </span>
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

            {/* Cancelling and waiving are kept apart from Delete on purpose:
                both preserve the event and its history, where Delete removes it. */}
            {draft.id &&
              (() => {
                const row = followUpByEvent.get(draft.id);
                if (!row) return null;
                const cancelled = row.followUp.status === "cancelled";
                const waived = row.followUp.waived;
                const canWaive = row.followUp.kind !== null;
                const unwaive = unwaivePresentation(row.followUp);
                return (
                  <div className="mt-4 space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <FollowUpStatusPill status={row.followUp.status} />
                      <span className="text-[11px] text-muted-foreground">
                        {followUpDetail(row.followUp, row.waiverReason, row.cancellationReason)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cancelled ? (
                        <button
                          onClick={() => handleReinstate(draft.id)}
                          className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-accent"
                        >
                          Reinstate event
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCancel(draft.id)}
                          className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-accent"
                        >
                          Cancel event
                        </button>
                      )}
                      {waived ? (
                        <button
                          onClick={() => handleUnwaive(draft.id, unwaive.successMessage)}
                          className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-accent"
                        >
                          {unwaive.label}
                        </button>
                      ) : canWaive ? (
                        <button
                          onClick={() => handleWaive(draft.id)}
                          className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-accent"
                        >
                          Mark write-up not required
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })()}

            <div className="mt-4 flex items-center justify-between gap-2">
              {draft.id ? (
                <button
                  onClick={() => handleDelete(draft.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" /> Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDraft(null)}
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Cancel
                </button>
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
        onClose={() => {
          setWorkflow(null);
          setLogPrefill({});
        }}
        prefillGkId={logPrefill.gkId}
        prefillMatchDate={logPrefill.date}
      />

      {canManage && (
        <FixtureImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          roster={roster}
          mentors={assignableMentors}
          existingEvents={events}
          onImported={refreshEvents}
        />
      )}
    </div>
  );
}
