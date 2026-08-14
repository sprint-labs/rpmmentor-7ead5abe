/**
 * Europe/London wall-clock arithmetic.
 *
 * Scheduling is agreed in London time: a 15:00 kick-off is 15:00 whether or not
 * British Summer Time is in force. Deadlines therefore have to be anchored to a
 * London wall clock rather than to the viewer's device, which may be in another
 * timezone entirely, and rather than to UTC, which drifts an hour twice a year.
 *
 * No dependency is added for this. `Intl` already knows the London rules,
 * including historical and future DST transitions, so the offset is read from
 * the platform instead of hard-coded.
 */

export const LONDON_TIME_ZONE = "Europe/London";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_ONLY = /^\d{2}:\d{2}$/;

/** Fallback end-of-day for a legacy event stored without a time. */
export const END_OF_DAY = "23:59";

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/**
 * How far ahead of UTC London is at a given instant, in milliseconds.
 * +1 hour during British Summer Time, 0 otherwise.
 */
function londonOffsetMs(instantMs: number): number {
  const parts = PARTS.formatToParts(new Date(instantMs));
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number(found.value) : 0;
  };
  // Some engines render midnight as hour 24 under hour12:false.
  const asIfUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour") % 24,
    field("minute"),
    field("second"),
  );
  return asIfUtc - instantMs;
}

/**
 * The instant at which a London wall-clock date and time occurs.
 *
 * Returns NaN for input that is not a calendar date, so a caller can decide how
 * to treat an unparseable row rather than silently working from epoch zero.
 *
 * The offset is applied twice on purpose. The first pass uses the offset in
 * force at the naive guess; the second re-reads it at the corrected instant, so
 * a time that sits just after a DST change resolves to the right side of it.
 */
export function londonWallClockMs(dateIso: string, time: string | null | undefined): number {
  const date = (dateIso ?? "").slice(0, 10);
  if (!DATE_ONLY.test(date)) return NaN;
  const clock = (time ?? "").trim();
  const hhmm = TIME_ONLY.test(clock) ? clock : END_OF_DAY;
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mi] = hhmm.split(":").map(Number) as [number, number];
  const naive = Date.UTC(y, m - 1, d, hh, mi);
  const firstPass = naive - londonOffsetMs(naive);
  return naive - londonOffsetMs(firstPass);
}

/** Add whole hours to an instant. */
export function addHours(instantMs: number, hours: number): number {
  return instantMs + hours * 3_600_000;
}

/** Today's calendar date in London, "YYYY-MM-DD". */
export function londonToday(now: number = Date.now()): string {
  const parts = PARTS.formatToParts(new Date(now));
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

const DISPLAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * A London-time label for an instant, e.g. "Fri 14 Aug, 16:00".
 * Used for deadlines, which are instants rather than calendar dates.
 */
export function formatLondonInstant(instantMs: number): string {
  if (!Number.isFinite(instantMs)) return "—";
  return DISPLAY.format(new Date(instantMs));
}

/**
 * Plain-English distance to a deadline, e.g. "in 6 hours" or "5 hours ago".
 * Deliberately coarse: the exact minute is noise when the window is 48 hours.
 */
export function describeDeadlineDistance(deadlineMs: number, now: number = Date.now()): string {
  if (!Number.isFinite(deadlineMs)) return "";
  const diffHours = Math.round((deadlineMs - now) / 3_600_000);
  const magnitude = Math.abs(diffHours);
  const unit =
    magnitude < 24
      ? `${magnitude} hour${magnitude === 1 ? "" : "s"}`
      : `${Math.round(magnitude / 24)} day${Math.round(magnitude / 24) === 1 ? "" : "s"}`;
  if (diffHours === 0) return "due now";
  return diffHours > 0 ? `in ${unit}` : `${unit} ago`;
}
