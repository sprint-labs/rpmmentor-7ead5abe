/**
 * The mentor's own month, on their dashboard.
 *
 * The manager home carries a compact month card whose squares hold presence
 * dots and nothing else. A mentor reading this is looking at their own diary
 * rather than the whole team's, so the squares are taller and they name what
 * is on: the time and who it is with, for the first couple of entries, with
 * any remainder counted.
 *
 * Dates are local `YYYY-MM-DD` throughout and are never round-tripped through
 * `new Date(iso)`, which would read them as UTC midnight and shift the day for
 * anyone west of UTC. See the note at the top of `mentor-upcoming-events.ts`.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatMonthParam,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  type MonthCursor,
} from "@/lib/calendar/month";
import { mentorPrimaryActionLabels } from "@/components/mentor/mentor-dashboard-cards";

/** The calendar columns this panel reads. */
export interface MentorMonthEvent {
  id: string;
  /** Local calendar date, "YYYY-MM-DD". */
  event_date: string;
  /** Clock time, "HH:MM[:SS]", or null when the event has no set time. */
  start_time: string | null;
  title: string;
  /** One of `EVENT_TYPES`; older rows may carry a retired type. */
  event_type: string;
  goalkeeper_name: string | null;
  status: string;
}

/** Entries named in a square before the rest are counted instead. */
const ENTRIES_SHOWN = 2;

/**
 * What kind of commitment each square is carrying.
 *
 * The hue rides a dot rather than the label: a wash of a hue behind text in
 * that same hue costs about a point of contrast, which at this size is the
 * difference between passing AA and not. The text stays in `--foreground`, so
 * the colour is decoration and the words are always fully legible.
 *
 * Match day takes `--event-match`, a violet added for this: green, amber and
 * red all carry duty-of-care meaning on the mentor's other panels, and blue is
 * already what an interaction looks like across the app.
 */
const TYPE_TONE: Record<string, string> = {
  Match: "bg-event-match",
  "Training Ground Visit": "bg-primary",
  "Coffee Catch-up": "bg-info",
};
const FALLBACK_TONE = "bg-muted-foreground";

function toneFor(eventType: string): string {
  return TYPE_TONE[eventType] ?? FALLBACK_TONE;
}

/** The ramp, named. Colour means nothing to a first-time reader without it. */
const LEGEND = [
  { label: "Match", tone: TYPE_TONE.Match },
  { label: "Training ground", tone: TYPE_TONE["Training Ground Visit"] },
  { label: "Catch-up", tone: TYPE_TONE["Coffee Catch-up"] },
] as const;

/** What a square says about one event: the time, then who it is with. */
function entryLabel(event: MentorMonthEvent): string {
  const time = event.start_time ? event.start_time.slice(0, 5) : "";
  const who = event.goalkeeper_name?.trim() || event.title;
  return time ? `${time} ${who}` : who;
}

export function MentorMonthPanel({
  events,
  pending,
  error,
  today,
}: {
  events: readonly MentorMonthEvent[] | undefined;
  pending: boolean;
  error: boolean;
  /** Today as a local `YYYY-MM-DD`. Injected so tests can pin it. */
  today: string;
}) {
  // Opened on the month `today` falls in, not the machine's. The two agree in
  // normal use, but taking it from the prop is what makes the grid a pure
  // function of its inputs — otherwise a test pinning a date still drifts once
  // the wall clock leaves that month.
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const [year, month] = today.split("-").map(Number);
    return year && month ? { year, month } : monthOf(new Date());
  });
  // Trimmed to the rows this month reaches into: a sixth row that is entirely
  // next month is dead height on a card this size.
  const cells = useMemo(() => monthGrid(cursor, { trim: true }), [cursor]);

  /** This month's events, in time order, indexed by the day they fall on. */
  const byDate = useMemo(() => {
    const map = new Map<string, MentorMonthEvent[]>();
    for (const event of events ?? []) {
      if (event.status === "cancelled") continue;
      const list = map.get(event.event_date) ?? [];
      list.push(event);
      map.set(event.event_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    }
    return map;
  }, [events]);

  const monthParam = formatMonthParam(cursor);
  const inMonthCount = useMemo(
    () =>
      cells
        .filter((cell) => cell.inMonth)
        .reduce((n, cell) => n + (byDate.get(cell.iso)?.length ?? 0), 0),
    [cells, byDate],
  );

  return (
    <div className="mb-4 border-b border-border pb-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
          aria-label={`Show ${monthLabel(shiftMonth(cursor, -1))}`}
          className="inline-flex size-8 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-foreground"
            aria-live="polite"
          >
            {monthLabel(cursor)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {pending
              ? "loading…"
              : error
                ? "unavailable"
                : `${inMonthCount} ${inMonthCount === 1 ? "event" : "events"}`}
          </span>
        </div>
        <span className="inline-flex items-center gap-2">
          <Link
            to="/calendar"
            search={{ gkId: "", new: false, month: monthParam }}
            className="hidden text-[10px] font-mono uppercase tracking-widest text-primary-ink hover:underline sm:inline-flex sm:items-center sm:gap-1"
          >
            {mentorPrimaryActionLabels.viewCalendar}
            <ArrowUpRight className="size-3" />
          </Link>
          <button
            type="button"
            onClick={() => setCursor((c) => shiftMonth(c, 1))}
            aria-label={`Show ${monthLabel(shiftMonth(cursor, 1))}`}
            className="inline-flex size-8 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronRight className="size-4" />
          </button>
        </span>
      </div>

      {error ? (
        // An unreachable calendar has to say so. An empty month would read as
        // "nothing is scheduled", which is a different claim entirely.
        <p className="py-6 text-center text-xs text-muted-foreground" role="status">
          Your calendar didn't load, so this month can't be shown. Refresh the page to try again.
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

          <div className="grid grid-cols-7 gap-1" aria-busy={pending}>
            {cells.map((cell) => {
              // Days borrowed from the neighbouring months hold the weekday
              // columns in line and nothing else. They stay in the DOM as
              // blanks because dropping them would slide the 1st under the
              // wrong weekday, and stay hidden from assistive technology
              // because there is nothing there to announce.
              if (!cell.inMonth) {
                return (
                  <div
                    key={cell.iso}
                    aria-hidden="true"
                    className="min-h-14 rounded border border-transparent sm:min-h-20"
                  />
                );
              }

              const dayEvents = pending ? [] : (byDate.get(cell.iso) ?? []);
              const shown = dayEvents.slice(0, ENTRIES_SHOWN);
              const extra = dayEvents.length - shown.length;
              const isToday = cell.iso === today;
              const label = `${cell.iso}${
                dayEvents.length
                  ? ` — ${dayEvents.map(entryLabel).join(", ")}`
                  : " — nothing scheduled"
              }${isToday ? " (today)" : ""}`;

              return (
                <Link
                  key={cell.iso}
                  to="/calendar"
                  search={{ gkId: "", new: false, month: monthParam }}
                  aria-label={label}
                  aria-current={isToday ? "date" : undefined}
                  className={[
                    "flex min-h-14 flex-col gap-0.5 rounded border p-1 text-left transition-colors sm:min-h-20",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    "border-border/60 hover:border-primary/50 hover:bg-accent/40",
                    isToday ? "border-primary bg-primary/10" : "",
                  ].join(" ")}
                >
                  <span
                    className={`text-[11px] tabular-nums ${
                      isToday ? "font-bold text-primary-ink" : "text-foreground"
                    }`}
                  >
                    {cell.day}
                  </span>

                  {/* Named entries need room to be legible, so below `sm` the
                      square carries its dots alone and the words are dropped. */}
                  <span aria-hidden="true" className="flex items-center gap-0.5 sm:hidden">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className={`size-1.5 shrink-0 rounded-full ${toneFor(event.event_type)}`}
                      />
                    ))}
                  </span>
                  <span aria-hidden="true" className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                    {shown.map((event) => (
                      <span key={event.id} className="flex items-center gap-1 leading-tight">
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${toneFor(event.event_type)}`}
                        />
                        <span className="truncate text-[9px] text-foreground">
                          {entryLabel(event)}
                        </span>
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className="pl-2.5 text-[9px] leading-tight text-muted-foreground">
                        +{extra} more
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>

          <div
            className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground"
            aria-hidden="true"
          >
            {LEGEND.map((entry) => (
              <span key={entry.label} className="inline-flex items-center gap-1">
                <span className={`size-1.5 shrink-0 rounded-full ${entry.tone}`} />
                {entry.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
