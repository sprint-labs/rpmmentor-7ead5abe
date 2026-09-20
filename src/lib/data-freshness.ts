/**
 * "Last synced" for a dashboard header.
 *
 * Three unrelated clocks get confused under the word "sync", so each is named
 * here and only one of them is allowed to drive the header label:
 *
 *   - `fetchedAt` — when THIS BROWSER last received these numbers from the
 *     database, i.e. react-query's `dataUpdatedAt`. The label sits beside the
 *     KPI cards, so a reader takes it as a statement about those numbers. That
 *     makes this the only honest source for it.
 *
 *   - `reportsSyncedAt` — when `public.match_reports_cache` last took a
 *     delivery from its own upstream. A real figure answering a different
 *     question, so it belongs in the explanatory tooltip, never in the headline.
 *
 *   - the outbound write queue in `@/lib/sync/queue`. That measures whether
 *     work THIS DEVICE created has finished uploading. It is not a freshness
 *     measure at all: it stays empty for every user who has never submitted a
 *     report while offline, and a stale value there says nothing about whether
 *     the figures on screen are current. It must never feed this label.
 *
 * Everything here is pure so the rules can be tested without a browser.
 */

import { LONDON_TIME_ZONE } from "@/lib/time/london";

/** react-query reports `dataUpdatedAt === 0` for a query that has never resolved. */
const NEVER_FETCHED = 0;

export type FreshnessTone = "fresh" | "stale" | "unknown" | "degraded";

export interface DataFreshness {
  /** Ready-to-render label, e.g. "Last synced 19 Sep 2026, 15:31". */
  label: string;
  tone: FreshnessTone;
  /** Longer explanation for the info tooltip. Always states what was measured. */
  detail: string;
}

/**
 * Numeric London-time parts. Only numbers are taken from `Intl`; the month name
 * is composed below from a fixed table.
 *
 * `Intl` is asked for the timezone maths, which it is authoritative for, and
 * not for the wording, which it is not stable for: en-GB CLDR abbreviates
 * September as "Sept", and which platforms do that varies by ICU version. In a
 * server-rendered app that variance is a hydration mismatch waiting to happen —
 * the server would emit one spelling and the browser another for the same
 * instant. Composing the label ourselves makes it identical everywhere.
 */
const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Absolute London-time label for an instant, e.g. "19 Sep 2026, 15:31".
 *
 * Absolute rather than relative on purpose. A relative label ("5m ago") has to
 * be re-rendered on a timer to stay true, and when its underlying value cannot
 * advance — as the outbound-queue value cannot — the timer animates the lie
 * instead of correcting it.
 */
export function formatSyncedAt(instantMs: number): string {
  if (!Number.isFinite(instantMs) || instantMs <= NEVER_FETCHED) return "—";
  const parts = PARTS.formatToParts(new Date(instantMs));
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  const month = MONTHS[Number(pick("month")) - 1];
  if (!month) return "—";
  // Some engines render midnight as hour 24 under hour12:false.
  const hour = String(Number(pick("hour")) % 24).padStart(2, "0");
  return `${Number(pick("day"))} ${month} ${pick("year")}, ${hour}:${pick("minute")}`;
}

/**
 * The same instant as `formatSyncedAt`, set to sit inside a sentence:
 * "19 Sep 2026 at 20:42". Derived from that one function rather than
 * formatted again, so the chip and the note behind it can never disagree.
 */
export function formatSyncedAtInSentence(instantMs: number): string {
  const label = formatSyncedAt(instantMs);
  return label === "—" ? label : label.replace(", ", " at ");
}

/**
 * The oldest of several fetch times, which is what bounds a screen's freshness:
 * a page is only as current as its most stale panel.
 *
 * Returns null when any query has never resolved, because "the oldest of the
 * ones that happen to have loaded" would be optimistic in exactly the way this
 * module exists to prevent.
 */
export function oldestFetchedAt(timestamps: readonly number[]): number | null {
  if (timestamps.length === 0) return null;
  let oldest = Infinity;
  for (const ts of timestamps) {
    if (!Number.isFinite(ts) || ts <= NEVER_FETCHED) return null;
    if (ts < oldest) oldest = ts;
  }
  return Number.isFinite(oldest) ? oldest : null;
}

/** Older than this and the screen is worth flagging rather than reassuring about. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export interface FreshnessInput {
  /** Per-query `dataUpdatedAt` values for every panel on the screen. */
  fetchedAt: readonly number[];
  /** True when any of those queries is currently in error. */
  anyError: boolean;
  /** `max(match_reports_cache.synced_at)`, ISO, for the tooltip only. */
  reportsSyncedAt?: string | null;
  now?: number;
}

/**
 * Decide what the header should say.
 *
 * The ordering matters. An error outranks a timestamp: when a panel has failed,
 * the screen is showing cache or nothing, and a confident "Last synced" beside
 * it would be the most misleading thing on the page.
 */
export function describeDataFreshness({
  fetchedAt,
  anyError,
  reportsSyncedAt,
  now = Date.now(),
}: FreshnessInput): DataFreshness {
  const oldest = oldestFetchedAt(fetchedAt);
  const storeLine = reportsSyncedAt
    ? ` Match report store last took a delivery ${formatSyncedAt(Date.parse(reportsSyncedAt))}.`
    : "";

  if (anyError) {
    return {
      label: "Some figures didn't load",
      tone: "degraded",
      detail:
        "At least one panel on this page failed to load, so the figures shown may be incomplete or from an earlier read. Refresh to try again." +
        storeLine,
    };
  }

  if (oldest == null) {
    return {
      label: "Checking for updates…",
      tone: "unknown",
      detail: "Waiting for the first successful read of this page's figures." + storeLine,
    };
  }

  const stale = now - oldest > STALE_AFTER_MS;
  return {
    label: `Last synced ${formatSyncedAt(oldest)}`,
    tone: stale ? "stale" : "fresh",
    // One sentence. The previous note ran to three, explaining that this is the
    // oldest of the reads behind the panels and when the match report store
    // last took a delivery — true, and more than anyone opens a tooltip for.
    // The time is the one on the chip itself, so the note explains the number
    // beside it rather than introducing a second one.
    detail: `System figures are current as of the last database sync, ${formatSyncedAtInSentence(oldest)} UK time.`,
  };
}
