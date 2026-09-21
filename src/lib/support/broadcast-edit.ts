/**
 * The rules an edit to an existing broadcast has to satisfy.
 *
 * These sit apart from the composer and the server function so both apply the
 * same rule: a client rejection and a server rejection never disagree, the way
 * the length bounds in `schema.ts` already do not.
 */

export type BroadcastEditExpiryMode = "none" | "custom";

export interface BroadcastEditTarget {
  /** When the broadcast published, or is scheduled to. */
  startsAt: string;
  /** Absolute end time, or null when it runs until ended by hand. */
  endsAt: string | null;
  active: boolean;
}

/**
 * An ended broadcast is the record of what people were told. Editing one would
 * change that record after the fact, so it is reused rather than rewritten.
 */
export function isBroadcastEditable(target: BroadcastEditTarget, nowMs: number): boolean {
  if (!target.active) return false;
  if (target.endsAt === null) return true;
  return Date.parse(target.endsAt) > nowMs;
}

/**
 * Resolve the end time an edit is asking for.
 *
 * Only "no end" and an explicit time are offered. A relative window such as
 * "24 hours" has no unambiguous anchor once a broadcast is already out — 24
 * hours from now, or from when it published? — so it is not a choice here even
 * though it is when composing.
 */
export function resolveBroadcastEditEnd(
  input: { expiryMode: BroadcastEditExpiryMode; endsAt: string },
  target: Pick<BroadcastEditTarget, "startsAt">,
): string | null {
  if (input.expiryMode === "none") return null;

  const parsed = new Date(input.endsAt);
  if (!input.endsAt.trim() || Number.isNaN(parsed.getTime())) {
    throw new Error("Choose a valid end time.");
  }

  const startMs = Date.parse(target.startsAt);
  if (Number.isNaN(startMs)) throw new Error("That broadcast has no valid publish time.");
  if (parsed.getTime() <= startMs) {
    throw new Error("The end time must be after the publish time.");
  }

  return parsed.toISOString();
}
