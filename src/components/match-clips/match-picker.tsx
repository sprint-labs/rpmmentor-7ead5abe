import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WEEKDAY_INITIALS,
  monthGrid,
  monthLabel,
  shiftMonth,
  type MonthCursor,
} from "@/lib/calendar/month";
import {
  formatMatchDate,
  matchLabel,
  matchesByDate,
  shiftDateOnly,
  weekOf,
  type MatchEventLike,
} from "@/lib/match-clips";
import { cn } from "@/lib/utils";

type View = "month" | "week";

export interface MatchPickerProps<E extends MatchEventLike> {
  /** Pickable matches, newest first — see `pickableMatches`. */
  matches: readonly E[];
  /** Selected `calendar_events.id`, or null for "No match yet". */
  value: string | null;
  onValueChange: (eventId: string | null) => void;
  /** YYYY-MM-DD, where the calendar opens when nothing is selected. */
  today: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  ariaLabel?: string;
  className?: string;
}

function cursorOf(dateIso: string): MonthCursor {
  const [year, month] = dateIso.split("-").map(Number);
  return { year: year!, month: month! };
}

function dayOfMonth(dateIso: string): number {
  return Number(dateIso.slice(8, 10));
}

/** "14 – 20 Sep 2026", or across months "28 Sep – 4 Oct 2026". */
function weekLabel(days: readonly string[]): string {
  const first = formatMatchDate(days[0]!).split(" ");
  const last = formatMatchDate(days[6]!).split(" ");
  const start = first[2] === last[2] ? first[1] : `${first[1]} ${first[2]}`;
  return `${start} – ${last[1]} ${last[2]} ${last[3]}`;
}

/**
 * "Select match": a button that opens the calendar — month or week, paged with
 * arrows — with the chosen day's matches listed beside it. A day with matches
 * is marked; clicking one of its matches selects it and closes the picker.
 */
export function MatchPicker<E extends MatchEventLike>({
  matches,
  value,
  onValueChange,
  today,
  disabled = false,
  loading = false,
  error = null,
  ariaLabel = "Match",
  className,
}: MatchPickerProps<E>) {
  const [open, setOpen] = useState(false);
  const selected = matches.find((event) => event.id === value) ?? null;
  const unavailable = disabled || loading;

  return (
    <div className={cn("space-y-1", className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        disabled={unavailable}
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-11 w-full min-w-0 items-center gap-3 rounded-md border px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60",
          selected
            ? "border-border bg-input/60"
            : "border-primary/50 bg-primary/10 text-primary-ink hover:bg-primary/15",
          error && "border-destructive",
        )}
      >
        {loading ? (
          <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin opacity-60" />
        ) : (
          <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">
          {loading ? "Loading matches…" : selected ? matchLabel(selected) : "Select match"}
        </span>
        {selected && !unavailable && (
          <span className="shrink-0 text-xs text-muted-foreground">Change</span>
        )}
      </button>
      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      {open && (
        <MatchCalendarDialog
          matches={matches}
          value={value}
          today={today}
          onClose={() => setOpen(false)}
          onChoose={(eventId) => {
            onValueChange(eventId);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function MatchCalendarDialog<E extends MatchEventLike>({
  matches,
  value,
  today,
  onClose,
  onChoose,
}: {
  matches: readonly E[];
  value: string | null;
  today: string;
  onClose: () => void;
  onChoose: (eventId: string | null) => void;
}) {
  const byDate = useMemo(() => matchesByDate(matches), [matches]);
  const selected = matches.find((event) => event.id === value) ?? null;
  // Open on the chosen match's day, else the most recent day with a match, else today.
  const initialDay = selected?.event_date ?? matches[0]?.event_date ?? today;

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<MonthCursor>(() => cursorOf(initialDay));
  const [activeDay, setActiveDay] = useState(initialDay);

  const days = useMemo(
    () =>
      view === "month"
        ? monthGrid(cursor, { trim: true }).map((cell) => ({
            iso: cell.iso,
            inRange: cell.inMonth,
          }))
        : weekOf(activeDay).map((iso) => ({ iso, inRange: true })),
    [view, cursor, activeDay],
  );

  const step = (delta: number) => {
    if (view === "month") {
      const next = shiftMonth(cursor, delta);
      setCursor(next);
      // Land on the latest day with a match in the new month, so the list is not empty.
      const prefix = `${next.year}-${String(next.month).padStart(2, "0")}`;
      const matchDay = [...byDate.keys()]
        .filter((iso) => iso.startsWith(prefix))
        .sort()
        .at(-1);
      setActiveDay(matchDay ?? `${prefix}-01`);
    } else {
      const next = shiftDateOnly(activeDay, -7 * delta);
      setActiveDay(next);
      setCursor(cursorOf(next));
    }
  };

  const chooseDay = (iso: string) => {
    setActiveDay(iso);
    setCursor(cursorOf(iso));
  };

  const heading = view === "month" ? monthLabel(cursor) : weekLabel(weekOf(activeDay));
  const dayMatches = byDate.get(activeDay) ?? [];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%_-_2rem)] max-w-4xl flex-col gap-0 overflow-hidden border-border bg-card p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-5 py-3.5 pr-12 text-left">
          <DialogTitle className="text-base">Select match</DialogTitle>
          <DialogDescription className="mt-0.5 text-xs">
            Pick a day, then the match the clips are from.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section
            aria-label="Calendar"
            className="border-b border-border p-4 md:border-b-0 md:border-r"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={view === "month" ? "Previous month" : "Previous week"}
                  onClick={() => step(-1)}
                  className="grid size-8 place-items-center rounded-md border border-border hover:bg-accent"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={view === "month" ? "Next month" : "Next week"}
                  onClick={() => step(1)}
                  className="grid size-8 place-items-center rounded-md border border-border hover:bg-accent"
                >
                  <ChevronRight className="size-4" />
                </button>
                <h3 aria-live="polite" className="ml-2 text-sm font-semibold">
                  {heading}
                </h3>
              </div>
              <div
                role="group"
                aria-label="Calendar view"
                className="inline-flex items-center gap-0.5 rounded-md border border-border bg-input/40 p-0.5"
              >
                {(["month", "week"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={view === option}
                    onClick={() => setView(option)}
                    className={cn(
                      "h-7 rounded px-2.5 text-xs font-medium capitalize",
                      view === option
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <span key={index} className="pb-1 text-[10px] font-medium text-muted-foreground">
                  {initial}
                </span>
              ))}
              {days.map(({ iso, inRange }) => {
                const count = byDate.get(iso)?.length ?? 0;
                const active = iso === activeDay;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => chooseDay(iso)}
                    aria-pressed={active}
                    aria-label={`${formatMatchDate(iso)}${count ? `, ${count} ${count === 1 ? "match" : "matches"}` : ""}`}
                    className={cn(
                      "flex flex-col items-center justify-start gap-1 rounded-md border py-1.5 text-xs transition-colors",
                      view === "week" ? "min-h-20" : "min-h-12",
                      active
                        ? "border-primary bg-primary/15 text-foreground"
                        : count
                          ? "border-border bg-input/40 hover:bg-accent"
                          : "border-transparent hover:bg-accent/60",
                      !inRange && "opacity-40",
                      iso === today && !active && "ring-1 ring-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "tabular-nums",
                        count ? "font-semibold" : "text-muted-foreground",
                      )}
                    >
                      {dayOfMonth(iso)}
                    </span>
                    {count > 0 && (
                      <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] leading-4 text-primary-foreground">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-label="Matches" className="flex min-h-0 flex-col p-4">
            <h3 className="text-sm font-semibold">{formatMatchDate(activeDay)}</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {dayMatches.length
                ? `${dayMatches.length} ${dayMatches.length === 1 ? "match" : "matches"}`
                : "No played matches on this day"}
            </p>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {dayMatches.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onChoose(event.id)}
                    className={cn(
                      "w-full rounded-md border px-3 py-2 text-left hover:bg-accent",
                      event.id === value ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    <span className="block text-sm font-medium leading-tight">{event.title}</span>
                    {event.goalkeeper_name && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {event.goalkeeper_name}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onChoose(null)}
              className="mt-3 h-9 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              No match in the calendar — upload as unmatched
            </button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
