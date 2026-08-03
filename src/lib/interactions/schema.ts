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

export const createInteractionInput = z.object({
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
