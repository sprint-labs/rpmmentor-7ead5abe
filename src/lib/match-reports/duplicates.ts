/**
 * Duplicate-submission fingerprinting for Match Reports.
 *
 * The duplicate key is goalkeeper + team + opponent + match date. The cache
 * `report_id` is NOT usable for this: it excludes Team, so two different
 * clubs' fixtures could collide.
 *
 * Legacy Sheet rows carry no true submit timestamp — `synced_at` in the cache
 * is just when reconciliation last ran. Those rows must never be classified
 * into a time window (see `classifyDuplicateWindow` callers).
 */

export const STRONG_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const SOFT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export function normaliseKeyPart(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export interface FingerprintInput {
  goalkeeper: string;
  team: string | null | undefined;
  opponent: string | null | undefined;
  match_date: string | null | undefined;
}

/** Stable four-field fingerprint used by the success ledger. */
export function submissionFingerprint(input: FingerprintInput): string {
  return [
    normaliseKeyPart(input.goalkeeper),
    normaliseKeyPart(input.team),
    normaliseKeyPart(input.opponent),
    (input.match_date ?? "").trim(),
  ].join("|");
}

export type DuplicateWindow = "strong" | "soft" | null;

/**
 * Classify how recently an identical successful submission landed.
 * `null` means "outside both windows" — no warning is raised.
 */
export function classifyDuplicateWindow(
  submittedAtMs: number,
  nowMs: number = Date.now(),
): DuplicateWindow {
  const age = nowMs - submittedAtMs;
  if (!Number.isFinite(age) || age < 0) return null;
  if (age <= STRONG_WINDOW_MS) return "strong";
  if (age <= SOFT_WINDOW_MS) return "soft";
  return null;
}

export function duplicateMessage(
  window: Exclude<DuplicateWindow, null>,
  input: FingerprintInput,
): string {
  const fixture = `${input.goalkeeper} vs ${input.opponent || "opponent"} on ${input.match_date ?? "this date"}`;
  return window === "strong"
    ? `A match report for ${fixture} (${input.team || "team"}) was submitted from this app in the last 10 minutes. This looks like a double submission.`
    : `A match report for ${fixture} (${input.team || "team"}) was already submitted from this app in the last 24 hours.`;
}

/** Client-side idempotency key so a lost response can't cause a second write. */
export function newSubmissionKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `sk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
