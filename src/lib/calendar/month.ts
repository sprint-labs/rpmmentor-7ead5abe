/**
 * Month-cursor arithmetic for the calendar page and the dashboard's month card.
 *
 * Both surfaces used to derive their grid from `new Date()` inline, which meant
 * the calendar could only ever show the current month and the two could not be
 * linked. A month is expressed here as a `YYYY-MM` string so it survives a URL
 * round-trip, and the grid is built in LOCAL calendar terms.
 *
 * Local, not UTC, on purpose: a grid is a wall calendar. `toISOString()` on a
 * local midnight rolls back a day for any viewer west of UTC, which is how a
 * fixture ends up rendered on the wrong square. Every date here is composed
 * from the local year/month/day fields instead.
 */

/** A month cursor, e.g. `{ year: 2026, month: 9 }` for September 2026. `month` is 1-12. */
export interface MonthCursor {
  year: number;
  month: number;
}

export interface MonthCell {
  /** Local calendar date, `YYYY-MM-DD`. */
  iso: string;
  /** Day of the month, 1-31. */
  day: number;
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean;
}

const MONTH_PARAM = /^(\d{4})-(0[1-9]|1[0-2])$/;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Weekday headings, Monday first, as a UK wall calendar is laid out. */
export const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;
export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** A fixed six rows, so the card does not change height as months change. */
const WEEKS = 6;
const DAYS_PER_WEEK = 7;

export interface MonthGridOptions {
  /** Stop after the last row containing a day of this month. */
  trim?: boolean;
}

/** Day 0 of the next month is the last day of this one. */
function daysInMonth({ year, month }: MonthCursor): number {
  return new Date(year, month, 0).getDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local `YYYY-MM-DD` for a Date, without going via UTC. */
export function localDateIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** The month a Date falls in, in local terms. */
export function monthOf(d: Date): MonthCursor {
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** `YYYY-MM` for a cursor — the URL form. */
export function formatMonthParam({ year, month }: MonthCursor): string {
  return `${year}-${pad2(month)}`;
}

/**
 * Read a `YYYY-MM` URL parameter.
 *
 * Returns the fallback month for anything unparseable rather than throwing, so
 * a mangled or hand-edited link opens the calendar on today rather than an
 * error page.
 */
export function parseMonthParam(
  value: string | undefined | null,
  fallback: MonthCursor,
): MonthCursor {
  const match = MONTH_PARAM.exec((value ?? "").trim());
  if (!match) return fallback;
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** Move the cursor by whole months, rolling the year over as needed. */
export function shiftMonth({ year, month }: MonthCursor, delta: number): MonthCursor {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

/** "September 2026". */
export function monthLabel({ year, month }: MonthCursor): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function isSameMonth(a: MonthCursor, b: MonthCursor): boolean {
  return a.year === b.year && a.month === b.month;
}

/**
 * The six-week, Monday-first grid for a month, including the adjacent-month
 * days that fill the first and last rows.
 *
 * Always 42 cells. A month starting on a Sunday with 31 days needs six rows,
 * and sizing the card to the worst case keeps the dashboard from reflowing when
 * the user pages between months.
 */
export function monthGrid(cursor: MonthCursor, options: MonthGridOptions = {}): MonthCell[] {
  const { year, month } = cursor;
  const firstOfMonth = new Date(year, month - 1, 1);
  // getDay() is Sunday-based; shift so Monday is 0.
  const leading = (firstOfMonth.getDay() + 6) % 7;

  // A fixed six rows keeps every month the same height, which is what a
  // full-page calendar wants — the grid does not jump as you page through the
  // year. A compact card has no such need, and the sixth row is often entirely
  // next month, so `trim` asks for only the rows this month reaches into.
  const weeks = options.trim ? Math.ceil((leading + daysInMonth(cursor)) / DAYS_PER_WEEK) : WEEKS;

  const cells: MonthCell[] = [];
  for (let i = 0; i < weeks * DAYS_PER_WEEK; i++) {
    // Day 1 of the month sits at index `leading`, so earlier indexes walk back
    // into the previous month and later ones roll into the next. The Date
    // constructor normalises both, including across a year boundary.
    const date = new Date(year, month - 1, 1 - leading + i);
    cells.push({
      iso: localDateIso(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month - 1 && date.getFullYear() === year,
    });
  }
  return cells;
}
