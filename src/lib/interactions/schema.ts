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

/**
 * Types that are still logged manually through the Log Interaction dialog.
 *
 * This tuple is the SINGLE source of truth for what a client may store: the
 * create/update validators and the log filter all derive their enum from it,
 * so a Live Match Observation can never be written or counted through the
 * interaction-logging path.
 */
export const MANUAL_INTERACTION_TYPES = INTERACTION_TYPES.filter(
  (t) => t !== MATCH_REPORT_INTERACTION_TYPE,
) as unknown as readonly [InteractionTypeValue, ...InteractionTypeValue[]];

/**
 * Types that drive dashboard KPI counts, charts and filter chips.
 *
 * Live Match Observation is excluded everywhere: it is created as a by-product
 * of a Match Report submission, so counting it as an interaction double-counts
 * the same activity already reported by the Reports cards. Every dashboard
 * reads this list against the SAME `occurred_at` calendar-day window.
 */
export const DASHBOARD_INTERACTION_TYPES = MANUAL_INTERACTION_TYPES;

/** Types excluded from dashboard KPI counts, filters and manual logging. */
export const DASHBOARD_EXCLUDED_INTERACTION_TYPES: readonly InteractionTypeValue[] = [
  MATCH_REPORT_INTERACTION_TYPE,
];

/** True when a type may be stored by the interaction-logging server functions. */
export function isLoggableInteractionType(value: string): value is InteractionTypeValue {
  return (MANUAL_INTERACTION_TYPES as readonly string[]).includes(value);
}

/** Event-linked and Match-Report-generated interactions keep their stored type. */
export function interactionTypeForEdit(
  storedType: string,
  calendarEventId: string | null,
  requestedType: string,
): string {
  return calendarEventId || storedType === MATCH_REPORT_INTERACTION_TYPE
    ? storedType
    : requestedType;
}


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
  interactionType: z.enum(MANUAL_INTERACTION_TYPES, { message: "Live Match Observation is recorded by submitting a Match Report, not by logging an interaction" }),
  /** Editable in the form; snapshot of the club at the time of the touchpoint. */
  club: z.string().trim().max(120).default(""),
  occurredAt: z.string().regex(DATE_ONLY, "Date must be a calendar date (YYYY-MM-DD)"),
  notes: z.string().trim().min(1, "Notes are required").max(8000),
  outcome: z.string().trim().max(120).default(""),
  followUp: z.string().trim().max(500).default(""),
  /**
   * The scheduled event this interaction writes up, when it was opened from one.
   * Confirmed server-side against `calendar_events`; a unique index guarantees a
   * single event cannot be closed out twice.
   */
  calendarEventId: z.string().regex(UUID, "calendarEventId must be a calendar_events.id").nullish(),
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
  // Editing a Match-Report-generated row must keep its "Live Match Observation"
  // type, so the update enum is the full list. The server enforces that the
  // type can never CHANGE into or out of Live Match Observation.
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
  /** Set when this interaction is the write-up for a scheduled event. */
  calendarEventId: string | null;
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
 * Voice recordings attached to an interaction.
 *
 * The audio itself lives in the existing `gk-media` bucket with a
 * `media_assets` row, exactly like every other upload. `interaction_media`
 * links that row to the interaction by primary key — never by goalkeeper name
 * or file name — so the recording survives a refresh and can be played back
 * from the log.
 */
export const attachInteractionAudioInput = z.object({
  interactionId: z.string().regex(UUID, "interactionId must be an interactions.id"),
  mediaId: z.string().regex(UUID, "mediaId must be a media_assets.id"),
});
export type AttachInteractionAudioInput = z.input<typeof attachInteractionAudioInput>;

export const listInteractionAudioQuery = z.object({
  interactionIds: z.array(z.string().regex(UUID)).max(100).default([]),
});
export type ListInteractionAudioQuery = z.input<typeof listInteractionAudioQuery>;

/** A confirmed `interaction_media` row. */
export interface InteractionAudioLink {
  id: string;
  interactionId: string;
  mediaId: string;
  createdAt: string;
  /** False when an identical link already existed — a retry, not a duplicate. */
  created: boolean;
}

/** A persisted recording, ready to play. */
export interface InteractionAudioClip {
  interactionId: string;
  mediaId: string;
  title: string;
  filePath: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  /** Short-lived playback URL. Null when one could not be signed. */
  signedUrl: string | null;
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
  interactionType: z.enum(MANUAL_INTERACTION_TYPES, { message: "Live Match Observation is recorded by submitting a Match Report, not by logging an interaction" }).optional(),
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
