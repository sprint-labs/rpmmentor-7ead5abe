export const BROADCAST_SCHEDULE_MIN_LEAD_MS = 30_000;

export type BroadcastPublishMode = "now" | "later";
export type BroadcastExpiryMode = "none" | "24h" | "7d" | "custom";

export type BroadcastWindowDraft = {
  publishMode: BroadcastPublishMode;
  startsAt: string;
  expiryMode: BroadcastExpiryMode;
  endsAt: string;
};

export type ResolvedBroadcastWindow = {
  scheduled: boolean;
  startsAt: string;
  endsAt: string | null;
};

function expiryForServerStart(
  mode: BroadcastExpiryMode | undefined,
  startsAt: string,
  suppliedEndsAt: string | null | undefined,
): string | null {
  if (mode === undefined) return suppliedEndsAt ?? null;
  if (mode === "none") return null;
  if (mode === "24h") {
    return new Date(Date.parse(startsAt) + 24 * 60 * 60 * 1000).toISOString();
  }
  if (mode === "7d") {
    return new Date(Date.parse(startsAt) + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (!suppliedEndsAt) throw new Error("Choose a valid end time.");
  return suppliedEndsAt;
}

export function validateResolvedBroadcastWindow(
  window: ResolvedBroadcastWindow,
  nowMs = Date.now(),
): void {
  const startMs = Date.parse(window.startsAt);
  if (!Number.isFinite(startMs)) throw new Error("Choose a valid publish time.");
  if (window.scheduled && startMs <= nowMs + BROADCAST_SCHEDULE_MIN_LEAD_MS) {
    throw new Error("Scheduled broadcasts need a future publish time.");
  }

  if (!window.endsAt) return;
  const endMs = Date.parse(window.endsAt);
  if (!Number.isFinite(endMs)) throw new Error("Choose a valid end time.");
  if (endMs <= startMs || endMs <= nowMs) {
    throw new Error("The end time must be after the publish time.");
  }
}

export function resolveBroadcastWindow(
  input: BroadcastWindowDraft,
  nowMs = Date.now(),
): ResolvedBroadcastWindow {
  const scheduled = input.publishMode === "later";
  const start = scheduled ? new Date(input.startsAt) : new Date(nowMs);
  if ((!input.startsAt && scheduled) || Number.isNaN(start.getTime())) {
    throw new Error("Choose a valid publish time.");
  }

  let endsAt: string | null;
  if (input.expiryMode === "none") {
    endsAt = null;
  } else if (input.expiryMode === "24h") {
    endsAt = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
  } else if (input.expiryMode === "7d") {
    endsAt = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    if (!input.endsAt) throw new Error("Choose a valid end time.");
    const end = new Date(input.endsAt);
    if (Number.isNaN(end.getTime())) throw new Error("Choose a valid end time.");
    endsAt = end.toISOString();
  }

  const resolved = {
    scheduled,
    startsAt: start.toISOString(),
    endsAt,
  };
  validateResolvedBroadcastWindow(resolved, nowMs);
  return resolved;
}

/**
 * Resolve the server contract while remaining compatible with clients from
 * before publishMode was explicit. Their intent is ambiguous, so preserve the
 * supplied start exactly and skip only the new lead-time rule. Explicit modes
 * get the stricter semantics: later enforces the lead and now anchors at the
 * server clock.
 */
export function resolveServerBroadcastWindow(
  input: {
    publishMode?: BroadcastPublishMode;
    expiryMode?: BroadcastExpiryMode;
    startsAt?: string | null;
    endsAt?: string | null;
  },
  nowMs = Date.now(),
): ResolvedBroadcastWindow {
  if (input.publishMode == null) {
    const startsAt = input.startsAt ?? new Date(nowMs).toISOString();
    const resolved = {
      scheduled: Date.parse(startsAt) > nowMs,
      startsAt,
      endsAt: input.endsAt ?? null,
    };
    validateResolvedBroadcastWindow({ ...resolved, scheduled: false }, nowMs);
    return resolved;
  }

  const scheduled = input.publishMode === "later";
  const startsAt = scheduled && input.startsAt ? input.startsAt : new Date(nowMs).toISOString();
  const resolved = {
    scheduled,
    startsAt,
    endsAt: expiryForServerStart(input.expiryMode, startsAt, input.endsAt),
  };
  validateResolvedBroadcastWindow(resolved, nowMs);
  return resolved;
}
