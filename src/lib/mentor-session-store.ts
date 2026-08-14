/**
 * Session-scoped mutable store for mentor-submitted interactions & match reports.
 *
 * Mirrors the Supabase-style row shapes declared in `mentor-domain.ts`, so a
 * future migration only needs to swap these arrays for real inserts into:
 *   - mentor_interactions
 *   - match_reports
 *
 * Everything is in-memory for the current tab/session — no persistence.
 */

import type { MentorInteractionRow, MatchReportRow } from "@/lib/mentor-domain";

/**
 * Whitelist of approved interaction types. Validated at the insert boundary
 * so any code path — UI, workflow, or future server ingestion — is rejected
 * unless it matches one of these four values.
 */
export const ALLOWED_INTERACTION_TYPES = [
  "Live Match Observation",
  "Training Ground Visit",
  "Coffee Catch Up",
  "Phone Call",
] as const;
export type AllowedInteractionType = (typeof ALLOWED_INTERACTION_TYPES)[number];

export class InvalidInteractionTypeError extends Error {
  constructor(received: string) {
    super(
      `Invalid interaction_type "${received}". Allowed: ${ALLOWED_INTERACTION_TYPES.join(", ")}.`,
    );
    this.name = "InvalidInteractionTypeError";
  }
}

const listeners = new Set<() => void>();
const interactions: MentorInteractionRow[] = [];
const reports: MatchReportRow[] = [];

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* noop */
    }
  });
}

export function subscribeMentorSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getSessionInteractions(): MentorInteractionRow[] {
  return interactions;
}

export function getSessionReports(): MatchReportRow[] {
  return reports;
}

export function insertMentorInteraction(
  row: Omit<MentorInteractionRow, "id">,
): MentorInteractionRow {
  if (!ALLOWED_INTERACTION_TYPES.includes(row.interaction_type as AllowedInteractionType)) {
    throw new InvalidInteractionTypeError(String(row.interaction_type));
  }
  const full: MentorInteractionRow = { id: `mi-${crypto.randomUUID()}`, ...row };
  interactions.unshift(full);
  emit();
  return full;
}

export function insertMatchReport(row: Omit<MatchReportRow, "id">): MatchReportRow {
  const full: MatchReportRow = { id: `mr-${crypto.randomUUID()}`, ...row };
  reports.unshift(full);
  emit();
  return full;
}
