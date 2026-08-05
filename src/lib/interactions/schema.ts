/**
 * Shared, client-safe contracts for durable interaction logging.
 *
 * `public.interactions` is the source of truth. This module holds the value
 * types, the Zod validator used by the server function, and the date-only
 * helpers — the form stores a CALENDAR DATE, never a timestamp, so it must
 * never be round-tripped through `new Date(iso)` + `toLocaleDateString()`
 * (that parses "YYYY-MM-DD" as UTC midnight and shifts the day west of UTC).
 */
import { z } from "zod";

export const INTERACTION_TYPES = [
  "Live Match Observation",
  "Training Ground Visit",
  "Coffee Catch Up",
  "Phone Call",
] as const;
export type InteractionTypeValue = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_OUTCOMES = [
  "On track",
  "Above expectation",
  "Below expectation",
  "Needs follow-up",
  "Action plan agreed",
] as const;

/** Interaction types that count toward duty-of-care cadence. */
export const DUTY_QUALIFYING_INTERACTION_TYPES: readonly InteractionTypeValue[] = [
  "Live Match Observation",
  "Training Ground Visit",
  "Coffee Catch Up",
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The interaction type that a Match Report produces. Selecting this type in the
 * Log Interaction dialog hands over to the Match Report workflow instead of
 * writing an interaction directly — the interaction is created server-side as
 * part of a successful report submission.
 */
export const MATCH_REPORT_INTERACTION_TYPE = "Live Match Observation" as const;

/** Types that are still logged manually through the Log Interaction dialog. */
export const MANUAL_INTERACTION_TYPES: readonly InteractionTypeValue[] = INTERACTION_TYPES.filter(
  (t) => t !== MATCH_REPORT_INTERACTION_TYPE,
);

/**
 * Types that drive dashboard KPI counts, charts and filter chips.
 *
 * Live Match Observation is excluded everywhere: it is created as a by-product
 * of a Match Report submission, so counting it as an interaction double-counts
 * the same activity already reported by the Reports cards. Every dashboard
 * reads this list against the SAME `occurred_at` calendar-day window.
 */
export const DASHBOARD_INTERACTION_TYPES: readonly InteractionTypeValue[] =
  MANUAL_INTERACTION_TYPES;

/** Types excluded from dashboard KPI counts and filters. */
export const DASHBOARD_EXCLUDED_INTERACTION_TYPES: readonly InteractionTypeValue[] = [
  MATCH_REPORT_INTERACTION_TYPE,
];

export const createInteractionInput = z.object({
  /**
   * Canonical `public.players.id`, present ONLY when the submitted selection
   * was a real player record. Never derived from a name. The server
   * re-confirms the row exists before storing it; anything else saves null.
   */
  playerId: z.string().regex(UUID, "playerId must be a players.id").nullish(),
  /** UI roster slug (e.g. "gk-james-beadle") — display identity only. */
  gkSlug: z.string().trim().max(120).default(""),
  goalkeeperName: z.string().trim().min(1, "Select a goalkeeper").max(120),
  interactionType: z.enum(INTERACTION_TYPES),
  /** Editable in the form; snapshot of the club at the time of the touchpoint. */
  club: z.string().trim().max(120).default(""),
  occurredAt: z.string().regex(DATE_ONLY, "Date must be a calendar date (YYYY-MM-DD)"),
  notes: z.string().trim().min(1, "Notes are required").max(8000),
  outcome: z.string().trim().max(120).default(""),
  followUp: z.string().trim().max(500).default(""),
});
// NOTE: mentor identity is never accepted from the client. It is derived
// server-side from the authenticated user id.
export type CreateInteractionInput = z.input<typeof createInteractionInput>;

/**
 * Editable fields of an existing interaction.
 *
 * `id` identifies the ORIGINAL row — an edit always updates in place and never
 * creates a replacement. `mentorId`, `createdAt` and `matchReportId` are absent
 * by design: they are immutable and enforced as such by a database trigger.
 */
export const updateInteractionInput = z.object({
  id: z.string().regex(UUID, "id must be an interactions.id"),
  playerId: z.string().regex(UUID, "playerId must be a players.id").nullish(),
  gkSlug: z.string().trim().max(120).default(""),
  goalkeeperName: z.string().trim().min(1, "Select a goalkeeper").max(120),
  interactionType: z.enum(INTERACTION_TYPES),
  club: z.string().trim().max(120).default(""),
  occurredAt: z.string().regex(DATE_ONLY, "Date must be a calendar date (YYYY-MM-DD)"),
  notes: z.string().trim().min(1, "Notes are required").max(8000),
  outcome: z.string().trim().max(120).default(""),
  followUp: z.string().trim().max(500).default(""),
});
export type UpdateInteractionInput = z.input<typeof updateInteractionInput>;

/** A durable interaction row as returned to the client. */
export interface LoggedInteraction {
  id: string;
  gkSlug: string;
  goalkeeperName: string;
  playerId: string | null;
  mentorId: string;
  mentorName: string;
  interactionType: string;
  club: string;
  /** Calendar date, "YYYY-MM-DD". */
  occurredAt: string;
  notes: string;
  outcome: string;
  followUp: string;
  createdAt: string;
  /** Set when this interaction was produced by a Match Report submission. */
  matchReportId: string | null;
  /** Present once the interaction has been edited. */
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Today's calendar date in the viewer's local timezone. */
export function todayDateOnly(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a stored calendar date without any timezone conversion.
 * Returns "—" for empty/invalid input.
 */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const match = DATE_ONLY.exec(value.slice(0, 10));
  if (!match) return value;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
  // Construct in LOCAL time from parts so the day can never shift.
  const local = new Date(y, m - 1, d);
  if (Number.isNaN(local.getTime())) return value;
  return local.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Milliseconds at local midnight of a stored calendar date. */
export function dateOnlyToLocalMs(value: string): number {
  if (!DATE_ONLY.test(value.slice(0, 10))) return NaN;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getTime();
}

/** Whole days between a stored calendar date and now. */
export function daysSinceDateOnly(value: string, now: number = Date.now()): number {
  const ms = dateOnlyToLocalMs(value);
  if (!Number.isFinite(ms)) return NaN;
  return Math.max(0, Math.floor((now - ms) / 86400000));
}

/**
 * Server-side query contract for the interactions log. Filtering and paging
 * happen in Postgres so the page stays fast as the table grows — the client
 * never downloads the full table to filter it.
 */
export const INTERACTIONS_PAGE_SIZE = 25;

export const listInteractionsQuery = z.object({
  /** Inclusive calendar-date lower bound. */
  from: z.string().regex(DATE_ONLY).optional(),
  /** Inclusive calendar-date upper bound. */
  to: z.string().regex(DATE_ONLY).optional(),
  /** Canonical mentor (profiles.id) filter. */
  mentorId: z.string().regex(UUID).optional(),
  /** Legacy/display mentor filter, matched against the stored snapshot. */
  mentorName: z.string().trim().max(120).optional(),
  interactionType: z.enum(INTERACTION_TYPES).optional(),
  /** Free-text match on goalkeeper name or club. */
  search: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(INTERACTIONS_PAGE_SIZE),
});
export type ListInteractionsQuery = z.input<typeof listInteractionsQuery>;

export interface InteractionsPage {
  rows: LoggedInteraction[];
  /** Total rows matching the filters, across all pages. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}
