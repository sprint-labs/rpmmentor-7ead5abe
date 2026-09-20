import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { SectionTitle } from "@/components/primitives";
import {
  formatMonthParam,
  isSameMonth,
  localDateIso,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  type MonthCursor,
} from "@/lib/calendar/month";

export interface MonthCardEvent {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  event_date: string;
  status: string;
}

/** A logged interaction, reduced to the day it happened on. */
export interface MonthCardInteraction {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  occurredAt: string;
}

export interface MonthCardProps {
  events: readonly MonthCardEvent[] | undefined;
  /**
   * Logged interactions, marked in the Interactions blue so the two kinds of
   * activity are told apart at a glance rather than by reading the day.
   */
  interactions?: readonly MonthCardInteraction[] | undefined;
  pending: boolean;
  error: boolean;
  /**
   * Today, as a local `YYYY-MM-DD`. Injected so tests can pin it and so the
   * whole dashboard agrees on one value for "today".
   */
  today?: string;
  className?: string;
}

/**
 * A real month grid for the dashboard, not a picture of one.
 *
 * The owner asked for "a box of just the calendar … even if it's a pic of a
 * calendar". A picture cannot be right: it bakes in a month, a year and a set
 * of weekday alignments, so it is wrong the day the month rolls over and it
 * rings the wrong square every day in between. It would also sit two panels
 * from live figures, which is exactly the confusion the rest of this screen is
 * being cleaned up to avoid. The event data is already in the browser for the
 * Upcoming Events panel, so the live version costs one more read of the same
 * cached query and nothing else.
 *
 * Cancelled events are excluded, matching the Upcoming Events panel beside it.
 */
export function CalendarMonthCard({
  events,
  interactions,
  pending,
  error,
  today: todayProp,
  className = "",
}: MonthCardProps) {
  // Resolved once per mount so a dashboard left open overnight does not shift
  // the highlighted square mid-render, and so both halves of this card agree.
  const [today] = useState(() => todayProp ?? localDateIso(new Date()));
  const todayMonth = useMemo(() => monthOf(new Date(`${today}T12:00:00`)), [today]);
  const [cursor, setCursor] = useState<MonthCursor>(todayMonth);

  // Trimmed: this card shows the month, not a fixed six-row frame. A sixth row
  // that is entirely next month is a row of noise in a panel this size.
  const cells = useMemo(() => monthGrid(cursor, { trim: true }), [cursor]);

  /** Event count per local date, cancellations excluded. */
  const countsByDate = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events ?? []) {
      if (event.status === "cancelled") continue;
      const date = event.event_date?.slice(0, 10);
      if (!date) continue;
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }
    return counts;
  }, [events]);

  /** Days carrying at least one logged interaction. */
  const interactionDays = useMemo(() => {
    const days = new Set<string>();
    for (const interaction of interactions ?? []) {
      const date = interaction.occurredAt?.slice(0, 10);
      if (date) days.add(date);
    }
    return days;
  }, [interactions]);

  const monthParam = formatMonthParam(cursor);
  const eventsThisMonth = useMemo(
    () => cells.filter((c) => c.inMonth).reduce((n, c) => n + (countsByDate.get(c.iso) ?? 0), 0),
    [cells, countsByDate],
  );

  return (
    <div className={`command-panel p-4 sm:p-5 ${className}`}>
      <SectionTitle
        action={
          <Link
            to="/calendar"
            search={{ gkId: "", new: false, month: monthParam }}
            className="text-[10px] font-mono uppercase tracking-widest text-primary-ink inline-flex items-center gap-1 hover:underline"
          >
            Open calendar <ArrowUpRight className="size-3" />
          </Link>
        }
      >
        Calendar
      </SectionTitle>

      {/* Month cursor. Paging is local to the card; the link carries whatever
          month is on screen, so "open calendar" lands where the user is looking. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCursor((c) => shiftMonth(c, -1))}
          aria-label={`Show ${monthLabel(shiftMonth(cursor, -1))}`}
          className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <div
          className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-foreground"
          aria-live="polite"
        >
          {monthLabel(cursor)}
        </div>
        <button
          type="button"
          onClick={() => setCursor((c) => shiftMonth(c, 1))}
          aria-label={`Show ${monthLabel(shiftMonth(cursor, 1))}`}
          className="inline-flex size-7 items-center justify-center rounded border border-border text-muted-foreground hover:border-primary/50 hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      {error ? (
        // An unreachable calendar must say so. Rendering an empty month would
        // read as "nothing is scheduled", which is a different claim entirely.
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

          <div className="grid grid-cols-7 gap-1" aria-busy={pending}>
            {cells.map((cell) => {
              const count = countsByDate.get(cell.iso) ?? 0;
              const isToday = cell.iso === today;
              const has = count > 0 && !pending;

              // Days borrowed from the adjacent months hold the weekday
              // columns in line and nothing else, so the card no longer draws
              // their numbers: this panel shows one month, and a date from
              // another one sitting in it only invites a misread. They stay in
              // the DOM as empty squares because dropping them would slide the
              // 1st under the wrong weekday, and stay hidden from assistive
              // technology because there is nothing there to announce.
              if (!cell.inMonth) {
                return (
                  <div
                    key={cell.iso}
                    aria-hidden="true"
                    className="flex aspect-square min-h-8 flex-col items-center justify-center rounded border border-transparent"
                  />
                );
              }

              const logged = interactionDays.has(cell.iso) && !pending;
              const parts = [
                has ? `${count} event${count === 1 ? "" : "s"}` : "",
                logged ? "interaction logged" : "",
              ].filter(Boolean);
              const label = `${cell.iso}${
                parts.length ? ` — ${parts.join(", ")}` : " — no events"
              }${isToday ? " (today)" : ""}`;
              return (
                <Link
                  key={cell.iso}
                  to="/calendar"
                  search={{ gkId: "", new: false, month: formatMonthParam(cursor) }}
                  aria-label={label}
                  aria-current={isToday ? "date" : undefined}
                  className={[
                    "relative flex aspect-square min-h-8 flex-col items-center justify-center rounded border text-[11px] tabular-nums transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    "border-border/60 text-foreground hover:border-primary/50 hover:bg-accent/40",
                    isToday ? "border-primary bg-primary/10 font-bold text-primary-ink" : "",
                  ].join(" ")}
                >
                  <span>{cell.day}</span>
                  {/* Presence dots only — green for something scheduled, blue
                      for an interaction logged. A precise count per square is
                      noise at this size; the numbers are in the aria-label and
                      on the calendar page itself. The row is always rendered so
                      every square keeps the same baseline. */}
                  <span aria-hidden="true" className="mt-0.5 flex h-1 items-center gap-0.5">
                    <span
                      className={`h-1 w-1 rounded-full ${has ? "bg-primary" : "bg-transparent"}`}
                    />
                    <span
                      className={`h-1 w-1 rounded-full ${logged ? "bg-info" : "bg-transparent"}`}
                    />
                  </span>
                </Link>
              );
            })}
          </div>

          <p className="mt-3 border-t border-border pt-2 text-[10px] text-muted-foreground">
            {pending
              ? "Loading events…"
              : `${eventsThisMonth} event${eventsThisMonth === 1 ? "" : "s"} in ${monthLabel(cursor)}`}
          </p>
        </>
      )}
    </div>
  );
}
