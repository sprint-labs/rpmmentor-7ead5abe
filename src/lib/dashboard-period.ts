/**
 * Single source of truth for dashboard KPI date windows.
 *
 * Every period-scoped card (Match Reports, Interactions, Clips, Overview)
 * must use this helper so the numbers are directly comparable and match the
 * filters that get forwarded to the destination pages.
 *
 * `from`/`to` are absolute instants (used for `timestamptz` columns such as
 * `media_assets.created_at`). `fromDate`/`toDate` are the *local* calendar
 * days of the same window (used for `date` columns such as
 * `interactions.occurred_at` and the Sheets `match_date`). Deriving the day
 * from the UTC ISO string instead would shift the window by one day for any
 * user east/west of UTC.
 */
export interface DashboardPeriod {
  days: number;
  from: string;
  to: string;
  fromDate: string;
  toDate: string;
}

export function toLocalDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function lastNDaysPeriod(days: number, now = new Date()): DashboardPeriod {
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return {
    days,
    from: from.toISOString(),
    to: to.toISOString(),
    fromDate: toLocalDateOnly(from),
    toDate: toLocalDateOnly(to),
  };
}

/** Inclusive comparison for `date`-typed values held as `YYYY-MM-DD`. */
export function isDateOnlyInPeriod(
  value: string | null | undefined,
  fromDate: string,
  toDate: string,
): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= fromDate && day <= toDate;
}
