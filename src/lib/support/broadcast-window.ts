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

const DATE_TIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const DATE_TIME_WITH_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;

function parseBroadcastDateTime(value: string, errorMessage: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(errorMessage);

  if (DATE_TIME_WITH_OFFSET.test(value)) return parsed;
  const localParts = DATE_TIME_LOCAL.exec(value);
  if (!localParts) throw new Error(errorMessage);
  const [, year, month, day, hour, minute, second = "0", fraction = "0"] = localParts;
  const milliseconds = Number(fraction.padEnd(3, "0"));
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day) ||
    parsed.getHours() !== Number(hour) ||
    parsed.getMinutes() !== Number(minute) ||
    parsed.getSeconds() !== Number(second) ||
    parsed.getMilliseconds() !== milliseconds
  ) {
    // Date normalises nonexistent local wall times across DST gaps (and
    // out-of-range calendar values). Never publish at a time other than the
    // one still shown in the native datetime-local control.
    throw new Error(errorMessage);
  }
  return parsed;
}

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
  if (!input.startsAt && scheduled) throw new Error("Choose a valid publish time.");
  const start = scheduled
    ? parseBroadcastDateTime(input.startsAt, "Choose a valid publish time.")
    : new Date(nowMs);
  if (Number.isNaN(start.getTime())) throw new Error("Choose a valid publish time.");

  let endsAt: string | null;
  if (input.expiryMode === "none") {
    endsAt = null;
  } else if (input.expiryMode === "24h") {
    endsAt = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
  } else if (input.expiryMode === "7d") {
    endsAt = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    if (!input.endsAt) throw new Error("Choose a valid end time.");
    const end = parseBroadcastDateTime(input.endsAt, "Choose a valid end time.");
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
