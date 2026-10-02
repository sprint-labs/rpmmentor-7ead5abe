/**
 * The manager home's calendar: the month and what is on it, in one panel.
 *
 * Owner request (2 Oct 2026): on desktop, show the calendar in full with the
 * details of upcoming fixtures and interactions, connected so it reads as one
 * large panel. It replaces a dot-only month card and a separate Upcoming
 * Fixtures list that sat beside it but never talked to it.
 *
 * - The squares name what is on each day — the time and who it is with — from
 *   `sm` up. Below that the words do not fit, so the squares keep their dots.
 * - The list beside the grid is the upcoming schedule. Picking a day turns it
 *   into that day: its fixtures, its planned interactions and the interactions
 *   logged on it.
 * - One filter, Fixtures or Interactions, narrows both halves together.
 *
 * Cancelled events are left out of both halves, as they were before.
 *
 * Dates are local `YYYY-MM-DD` throughout and are compared as strings, never
 * round-tripped through `new Date(iso)`, which reads them as UTC midnight and
 * shifts the day for anyone west of UTC.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { SectionTitle, TierBadge } from "@/components/primitives";
import { formatRelative, type Goalkeeper } from "@/lib/mock-data";
import {
  formatMonthParam,
  monthGrid,
  monthLabel,
  shiftMonth,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  type MonthCursor,
} from "@/lib/calendar/month";
import { cn } from "@/lib/utils";

/** The calendar columns this panel reads. */
export interface TeamCalendarPanelEvent {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  event_date: string;
  /** Clock time, `HH:MM[:SS]`, or null when the event has no set time. */
  start_time: string | null;
  title: string;
  event_type: string;
  goalkeeper_name: string | null;
  location: string | null;
  status: string;
}

/** A logged interaction, reduced to what a square and a list row print. */
export interface TeamCalendarPanelInteraction {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  occurredAt: string;
  interactionType: string;
  goalkeeperName: string;
  mentorName: string;
}

type ResolvedGoalkeeper = Pick<Goalkeeper, "id" | "tier">;

/** fixture: a Match. interaction: any other calendar event. logged: a saved interaction. */
type EntryKind = "fixture" | "interaction" | "logged";
type KindFilter = "" | "fixtures" | "interactions";

const KIND_FILTERS: readonly { id: KindFilter; label: string }[] = [
  { id: "", label: "All" },
  { id: "fixtures", label: "Fixtures" },
  { id: "interactions", label: "Interactions" },
];

/** The one event type that is a fixture, as on the calendar page. */
const FIXTURE_EVENT_TYPE = "Match";

/**
 * Violet for a fixture, as on the mentor's month panel: green, amber and red
 * already carry duty-of-care meaning on this page. Blue is what an
 * interaction looks like across the app — solid when it is booked, an outline
 * once it has been logged.
 */
const TONE: Record<EntryKind, string> = {
  fixture: "bg-event-match",
  interaction: "bg-info",
  logged: "border border-info",
};

const LEGEND: readonly { kind: EntryKind; label: string }[] = [
  { kind: "fixture", label: "Fixture" },
  { kind: "interaction", label: "Interaction booked" },
  { kind: "logged", label: "Interaction logged" },
];

/** Named entries in a square before the rest are counted instead. */
const ENTRIES_SHOWN = 2;
/** Rows in the upcoming list before the rest are counted instead. */
const UPCOMING_SHOWN = 8;

interface DayEntry {
  key: string;
  kind: EntryKind;
  /** "HH:MM", or "" when there is no set time. */
  time: string;
  /** What a square says: the goalkeeper, else the title. */
  short: string;
}

function eventKind(event: TeamCalendarPanelEvent): EntryKind {
  return event.event_type === FIXTURE_EVENT_TYPE ? "fixture" : "interaction";
}

function passesFilter(kind: EntryKind, filter: KindFilter): boolean {
  if (filter === "fixtures") return kind === "fixture";
  if (filter === "interactions") return kind !== "fixture";
  return true;
}

function clock(time: string | null): string {
  return time ? time.slice(0, 5) : "";
}

function byDateThenTime(a: TeamCalendarPanelEvent, b: TeamCalendarPanelEvent): number {
  return (
    a.event_date.localeCompare(b.event_date) ||
    (a.start_time ?? "").localeCompare(b.start_time ?? "")
  );
}

/** "Thursday 15 October", read from the date string itself rather than a clock. */
function dayHeading(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface TeamCalendarPanelProps {
  events: readonly TeamCalendarPanelEvent[] | undefined;
  interactions?: readonly TeamCalendarPanelInteraction[] | undefined;
  /** The calendar read. */
  pending: boolean;
  error: boolean;
  /**
   * The logged-interactions read, which is separate from the calendar's. While
   * it is in flight or has failed, the panel says so rather than reporting
   * "0 logged" or an empty day as if the read had come back empty.
   */
  interactionsPending?: boolean;
  interactionsError?: boolean;
  /**
   * Today, as a local `YYYY-MM-DD`. Injected so tests can pin it and so the
   * whole dashboard agrees on one value for "today".
   */
  today: string;
  /** Links an event's goalkeeper to their profile when the roster knows them. */
  resolveGoalkeeper?: (name: string) => ResolvedGoalkeeper | null;
  /** Links set beside "Open calendar" in the panel heading. */
  actions?: ReactNode;
  className?: string;
}

export function TeamCalendarPanel({
  events,
  interactions,
  pending,
  error,
  interactionsPending = false,
  interactionsError = false,
  today,
  resolveGoalkeeper,
  actions,
  className,
}: TeamCalendarPanelProps) {
  // Opened on the month `today` falls in, taken from the prop rather than the
  // machine's clock, so a test pinning a date does not drift with the wall
  // clock and the whole dashboard agrees on one "today".
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const [year, month] = today.split("-").map(Number);
    return { year: year || 1970, month: month || 1 };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<KindFilter>("");

  // Trimmed: a sixth row that is entirely next month is dead height here.
  const cells = useMemo(() => monthGrid(cursor, { trim: true }), [cursor]);
  const monthParam = formatMonthParam(cursor);

  const liveEvents = useMemo(
    () => (events ?? []).filter((e) => e.status !== "cancelled" && e.event_date),
    [events],
  );

  /** Every live event and logged interaction, by the day it falls on. */
  const byDate = useMemo(() => {
    const map = new Map<
      string,
      { events: TeamCalendarPanelEvent[]; logged: TeamCalendarPanelInteraction[] }
    >();
    const slot = (date: string) => {
      let day = map.get(date);
      if (!day) {
        day = { events: [], logged: [] };
        map.set(date, day);
      }
      return day;
    };
    for (const event of liveEvents) slot(event.event_date.slice(0, 10)).events.push(event);
    for (const interaction of interactions ?? []) {
      const date = interaction.occurredAt?.slice(0, 10);
      if (date) slot(date).logged.push(interaction);
    }
    for (const day of map.values()) day.events.sort(byDateThenTime);
    return map;
  }, [liveEvents, interactions]);

  /** What a square names, in time order, logged interactions after the bookings. */
  function entriesFor(date: string): DayEntry[] {
    const day = byDate.get(date);
    if (!day) return [];
    const entries: DayEntry[] = [
      ...day.events.map((e) => ({
        key: `event-${e.id}`,
        kind: eventKind(e),
        time: clock(e.start_time),
        short: e.goalkeeper_name?.trim() || e.title,
      })),
      ...day.logged.map((i) => ({
        key: `logged-${i.id}`,
        kind: "logged" as const,
        time: "",
        short: i.goalkeeperName?.trim() || i.interactionType,
      })),
    ];
    return entries.filter((entry) => passesFilter(entry.kind, filter));
  }

  const upcomingAll = useMemo(
    () =>
      liveEvents
        .filter((e) => e.event_date >= today && passesFilter(eventKind(e), filter))
        .sort(byDateThenTime),
    [liveEvents, today, filter],
  );
  const upcoming = upcomingAll.slice(0, UPCOMING_SHOWN);

  const monthTotals = useMemo(() => {
    let scheduled = 0;
    let logged = 0;
    for (const cell of cells) {
      if (!cell.inMonth) continue;
      const day = byDate.get(cell.iso);
      if (!day) continue;
      scheduled += day.events.filter((e) => passesFilter(eventKind(e), filter)).length;
      if (passesFilter("logged", filter)) logged += day.logged.length;
    }
    return { scheduled, logged };
  }, [cells, byDate, filter]);

  function pageMonth(delta: number) {
    setCursor((c) => shiftMonth(c, delta));
    // The picked day is no longer on screen, so the list goes back to what is
    // coming up rather than describing a square the reader cannot see.
    setSelected(null);
  }

  const selectedDay = selected ? byDate.get(selected) : undefined;
  const selectedEvents = (selectedDay?.events ?? []).filter((e) =>
    passesFilter(eventKind(e), filter),
  );
  const selectedLogged = passesFilter("logged", filter) ? (selectedDay?.logged ?? []) : [];
  /** Logged interactions are in view but their read has not come back whole. */
  const loggedUnknown =
    passesFilter("logged", filter) && (interactionsPending || interactionsError);
  const loggedNote = interactionsPending
    ? "Loading logged interactions…"
    : "Logged interactions didn't load, so this day may be missing some.";

  const navButton =
    "inline-flex size-8 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const linkAction =
    "text-[10px] font-mono uppercase tracking-widest text-primary-ink inline-flex items-center gap-1 hover:underline";

  return (
    <section className={cn("command-panel p-4 sm:p-5", className)}>
      <SectionTitle
        className="flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3"
        action={
          <span className="inline-flex flex-wrap items-center gap-3">
            {actions}
            <Link
              to="/calendar"
              search={{ gkId: "", new: false, month: monthParam }}
              className={linkAction}
            >
              Open calendar <ArrowUpRight className="size-3" />
            </Link>
          </span>
        }
      >
        Calendar
      </SectionTitle>
      <p className="-mt-2 mb-4 text-xs text-muted-foreground">
        Fixtures and interactions on the team calendar. Pick a day to see everything on it.
      </p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* The month. */}
        <div className="min-w-0 lg:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => pageMonth(-1)}
                aria-label={`Show ${monthLabel(shiftMonth(cursor, -1))}`}
                className={navButton}
              >
                <ChevronLeft className="size-4" />
              </button>
              <span
                className="min-w-32 text-center font-mono text-xs font-bold uppercase tracking-[0.14em] text-foreground"
                aria-live="polite"
              >
                {monthLabel(cursor)}
              </span>
              <button
                type="button"
                onClick={() => pageMonth(1)}
                aria-label={`Show ${monthLabel(shiftMonth(cursor, 1))}`}
                className={navButton}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div
              role="group"
              aria-label="Show on the calendar"
              className="inline-flex gap-1 rounded-md border border-border p-0.5"
            >
              {KIND_FILTERS.map((option) => (
                <button
                  key={option.id || "all"}
                  type="button"
                  aria-pressed={filter === option.id}
                  onClick={() => setFilter(option.id)}
                  className={cn(
                    "min-h-8 rounded px-2.5 text-[10px] font-mono uppercase tracking-widest transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    filter === option.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            // An unreachable calendar must say so. An empty month would read
            // as "nothing is scheduled", which is a different claim entirely.
            <p className="py-6 text-center text-xs text-muted-foreground" role="status">
              The calendar didn't load, so this month can't be shown. Refresh the page to try again.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1" role="presentation">
                {WEEKDAY_INITIALS.map((initial, i) => (
                  <div
                    key={WEEKDAY_NAMES[i]}
                    aria-hidden="true"
                    className="pb-1 text-center font-mono text-[9px] uppercase tracking-widest text-muted-foreground"
                  >
                    {initial}
                  </div>
                ))}
              </div>

              <div
                className="grid grid-cols-7 gap-1"
                aria-busy={pending || (loggedUnknown && interactionsPending)}
              >
                {cells.map((cell) => {
                  // Days borrowed from the neighbouring months hold the
                  // weekday columns in line and nothing else. They stay as
                  // blanks because dropping them would slide the 1st under
                  // the wrong weekday.
                  if (!cell.inMonth) {
                    return (
                      <div
                        key={cell.iso}
                        aria-hidden="true"
                        className="min-h-12 rounded border border-transparent sm:min-h-20"
                      />
                    );
                  }

                  const entries = pending ? [] : entriesFor(cell.iso);
                  const shown = entries.slice(0, ENTRIES_SHOWN);
                  const extra = entries.length - shown.length;
                  const isToday = cell.iso === today;
                  const isSelected = cell.iso === selected;
                  const fixtures = entries.filter((e) => e.kind === "fixture").length;
                  const booked = entries.filter((e) => e.kind === "interaction").length;
                  const logged = entries.filter((e) => e.kind === "logged").length;
                  const parts = [
                    fixtures ? plural(fixtures, "fixture") : "",
                    booked ? plural(booked, "interaction booked", "interactions booked") : "",
                    logged ? plural(logged, "interaction logged", "interactions logged") : "",
                  ].filter(Boolean);
                  // While the logged-interactions read is out, a square only
                  // knows its bookings, so its label says so rather than
                  // claiming the day is empty or complete.
                  const label = `${cell.iso} — ${
                    parts.length
                      ? parts.join(", ")
                      : loggedUnknown
                        ? "nothing booked"
                        : "nothing on"
                  }${
                    loggedUnknown
                      ? interactionsPending
                        ? ", logged interactions loading"
                        : ", logged interactions unavailable"
                      : ""
                  }${isToday ? " (today)" : ""}`;

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onClick={() => setSelected(isSelected ? null : cell.iso)}
                      aria-label={label}
                      aria-pressed={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "flex min-h-12 min-w-0 flex-col gap-0.5 rounded border p-1 text-left transition-colors sm:min-h-20",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        "border-border/60 hover:border-primary/50 hover:bg-accent/40",
                        isToday && "border-primary bg-primary/10",
                        isSelected && "border-primary ring-1 ring-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[11px] tabular-nums",
                          isToday ? "font-bold text-primary-ink" : "text-foreground",
                        )}
                      >
                        {cell.day}
                      </span>

                      {/* Named entries need room to be legible, so below `sm`
                          the square carries its dots alone. */}
                      <span aria-hidden="true" className="flex items-center gap-0.5 sm:hidden">
                        {entries.slice(0, 3).map((entry) => (
                          <span
                            key={entry.key}
                            className={cn("size-1.5 shrink-0 rounded-full", TONE[entry.kind])}
                          />
                        ))}
                      </span>
                      <span aria-hidden="true" className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                        {shown.map((entry) => (
                          <span
                            key={entry.key}
                            className="flex min-w-0 items-center gap-1 leading-tight"
                          >
                            <span
                              className={cn("size-1.5 shrink-0 rounded-full", TONE[entry.kind])}
                            />
                            <span className="truncate text-[9px] text-foreground">
                              {entry.time ? `${entry.time} ${entry.short}` : entry.short}
                            </span>
                          </span>
                        ))}
                        {extra > 0 && (
                          <span className="pl-2.5 text-[9px] leading-tight text-muted-foreground">
                            +{extra} more
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
                <span aria-hidden="true" className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {LEGEND.map((entry) => (
                    <span key={entry.kind} className="inline-flex items-center gap-1">
                      <span className={cn("size-1.5 shrink-0 rounded-full", TONE[entry.kind])} />
                      {entry.label}
                    </span>
                  ))}
                </span>
                <span>
                  {pending
                    ? "Loading events…"
                    : `${plural(monthTotals.scheduled, "event")} scheduled · ${
                        interactionsPending
                          ? "logged interactions loading"
                          : interactionsError
                            ? "logged interactions unavailable"
                            : `${monthTotals.logged} logged`
                      } in ${monthLabel(cursor)}`}
                </span>
              </div>
            </>
          )}
        </div>

        {/* What is on: upcoming, or the day picked on the grid. */}
        <div className="min-w-0 border-t border-border pt-4 lg:col-span-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          {selected ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {dayHeading(selected)}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="inline-flex min-h-8 items-center gap-1 rounded px-1 text-[10px] font-mono uppercase tracking-widest text-primary-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X className="size-3" aria-hidden="true" /> Show upcoming
                </button>
              </div>
              {/* Gated on the calendar read, as the upcoming list is: a day
                  picked before it lands, or before it fails, must not read as
                  a day with nothing booked. */}
              {pending ? (
                <p className="py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Loading calendar…
                </p>
              ) : error ? (
                <p className="py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Calendar didn't load
                </p>
              ) : selectedEvents.length === 0 && selectedLogged.length === 0 ? (
                <p className="py-6 text-center text-[11px] text-muted-foreground">
                  {loggedUnknown ? loggedNote : "Nothing on this day."}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {selectedEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      goalkeeper={
                        event.goalkeeper_name
                          ? (resolveGoalkeeper?.(event.goalkeeper_name) ?? null)
                          : null
                      }
                      showDate={false}
                    />
                  ))}
                  {selectedLogged.map((interaction) => (
                    <LoggedRow key={interaction.id} interaction={interaction} />
                  ))}
                  {loggedUnknown && (
                    <p className="py-3 text-[11px] text-muted-foreground">{loggedNote}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-foreground">
                Upcoming
              </h3>
              {/* An undisclosed cap reads as "there are only eight". */}
              {!pending && !error && upcomingAll.length > upcoming.length ? (
                <p className="mb-1 text-[10px] text-muted-foreground">
                  Showing the next {upcoming.length} of {upcomingAll.length} scheduled.
                </p>
              ) : null}
              {pending ? (
                <p className="py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Loading calendar…
                </p>
              ) : error ? (
                <p className="py-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Calendar didn't load
                </p>
              ) : upcoming.length === 0 ? (
                <div className="space-y-2 py-6 text-center">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    Nothing scheduled
                  </p>
                  <p className="px-2 text-[11px] text-muted-foreground">
                    This reads the shared team calendar. Schedule a visit or catch-up to fill it.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {upcoming.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      goalkeeper={
                        event.goalkeeper_name
                          ? (resolveGoalkeeper?.(event.goalkeeper_name) ?? null)
                          : null
                      }
                      showDate
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** One booked event. Links to the goalkeeper's profile when the roster knows them. */
function EventRow({
  event,
  goalkeeper,
  showDate,
}: {
  event: TeamCalendarPanelEvent;
  goalkeeper: ResolvedGoalkeeper | null;
  showDate: boolean;
}) {
  const kind = eventKind(event);
  const when = [showDate ? formatRelative(event.event_date) : "", clock(event.start_time)]
    .filter(Boolean)
    .join(" · ");
  const content = (
    <>
      <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE[kind])} />
      <div className="min-w-0 flex-1">
        {when ? (
          <div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-primary-ink">
            {when}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium">{event.title}</span>
          {goalkeeper ? <TierBadge tier={goalkeeper.tier} /> : null}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {event.event_type}
          {event.goalkeeper_name ? ` · ${event.goalkeeper_name}` : ""}
          {event.location ? ` · ${event.location}` : ""}
        </div>
      </div>
    </>
  );
  return goalkeeper ? (
    <Link
      to="/goalkeepers/$gkId"
      params={{ gkId: goalkeeper.id }}
      className="-mx-2 flex items-start gap-3 px-2 py-3 transition-colors hover:bg-accent/30"
    >
      {content}
    </Link>
  ) : (
    <div className="-mx-2 flex items-start gap-3 px-2 py-3">{content}</div>
  );
}

/** One interaction already logged on the picked day. Opens the record itself. */
function LoggedRow({ interaction }: { interaction: TeamCalendarPanelInteraction }) {
  const who = interaction.mentorName?.trim();
  return (
    <Link
      to="/interactions/$interactionId"
      params={{ interactionId: interaction.id }}
      className="-mx-2 flex items-start gap-3 px-2 py-3 transition-colors hover:bg-accent/30"
    >
      <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", TONE.logged)} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-[10px] font-mono uppercase tracking-widest text-info">Logged</div>
        <div className="truncate text-xs font-medium">
          {interaction.interactionType}
          {interaction.goalkeeperName ? ` with ${interaction.goalkeeperName}` : ""}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {who && !who.includes("@") ? `By ${who}` : "By a mentor"}
        </div>
      </div>
    </Link>
  );
}
