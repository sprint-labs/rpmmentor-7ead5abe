import type { AnnouncementKind, AnnouncementRow } from "@/lib/support/schema";

export type BroadcastScheduleMode = "now" | "later";
export type BroadcastExpiryMode = "none" | "24h" | "7d" | "custom";
export type BroadcastStatus = "draft" | "scheduled" | "live" | "ended";

export interface BroadcastTemplate {
  id: string;
  label: string;
  description: string;
  kind: AnnouncementKind;
  title: string;
  body: string;
}

export const BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    id: "feature",
    label: "New feature",
    description: "Explain a new workflow or product improvement.",
    kind: "feature",
    title: "New in Mentor Hub",
    body: "What has changed:\n\nWhy it matters:\n\nWhat you need to do:",
  },
  {
    id: "update",
    label: "General update",
    description: "Share an operational update or reminder.",
    kind: "info",
    title: "Mentor Hub update",
    body: "Here is the latest update:\n\nWhat this means for you:",
  },
  {
    id: "incident",
    label: "Service incident",
    description: "Flag a live issue that users need to know about.",
    kind: "incident",
    title: "We are investigating an issue",
    body: "What is affected:\n\nCurrent status:\n\nNext update:",
  },
  {
    id: "downtime",
    label: "Planned downtime",
    description: "Give advance warning of planned maintenance.",
    kind: "downtime",
    title: "Planned Mentor Hub maintenance",
    body: "When:\n\nExpected impact:\n\nWhat you need to do:",
  },
];

export const ANNOUNCEMENT_KIND_LABEL: Record<AnnouncementKind, string> = {
  feature: "New feature",
  info: "Update",
  incident: "Incident",
  downtime: "Downtime",
};

export function announcementPlacement(kind: AnnouncementKind): string {
  return kind === "feature" || kind === "info"
    ? "Help & updates panel"
    : "Notification bell and sitewide service banner";
}

export function toDateTimeLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function defaultScheduledTime(now = new Date()): string {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return toDateTimeLocalInput(next);
}

export function resolveBroadcastDates(input: {
  scheduleMode: BroadcastScheduleMode;
  startsAtLocal: string;
  expiryMode: BroadcastExpiryMode;
  endsAtLocal: string;
  now?: Date;
}): { startsAt: string | null; endsAt: string | null } {
  const now = input.now ?? new Date();
  let start = now;
  let startsAt: string | null = null;

  if (input.scheduleMode === "later") {
    if (!input.startsAtLocal) throw new Error("Choose when the broadcast should start.");
    start = new Date(input.startsAtLocal);
    if (Number.isNaN(start.getTime())) throw new Error("The scheduled start time is invalid.");
    if (start.getTime() <= now.getTime()) {
      throw new Error("The scheduled start time must be in the future.");
    }
    startsAt = start.toISOString();
  }

  if (input.expiryMode === "none") return { startsAt, endsAt: null };

  if (input.expiryMode === "24h") {
    return { startsAt, endsAt: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString() };
  }

  if (input.expiryMode === "7d") {
    return { startsAt, endsAt: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() };
  }

  if (!input.endsAtLocal) throw new Error("Choose when the broadcast should end.");
  const end = new Date(input.endsAtLocal);
  if (Number.isNaN(end.getTime())) throw new Error("The end time is invalid.");
  if (end.getTime() <= start.getTime()) {
    throw new Error("The end time must be after the broadcast starts.");
  }

  return { startsAt, endsAt: end.toISOString() };
}

export function getBroadcastStatus(
  announcement: Pick<AnnouncementRow, "active" | "startsAt" | "endsAt" | "createdAt">,
  now = new Date(),
): BroadcastStatus {
  const nowMs = now.getTime();
  const startsMs = new Date(announcement.startsAt).getTime();
  const endsMs = announcement.endsAt ? new Date(announcement.endsAt).getTime() : null;
  const createdMs = new Date(announcement.createdAt).getTime();

  if (!announcement.active) {
    if (!announcement.endsAt && nowMs - createdMs < 30 * 60 * 1000) return "draft";
    return "ended";
  }
  if (endsMs !== null && endsMs <= nowMs) return "ended";
  if (startsMs > nowMs) return "scheduled";
  return "live";
}

export function formatBroadcastTiming(input: {
  scheduleMode: BroadcastScheduleMode;
  startsAtLocal: string;
  expiryMode: BroadcastExpiryMode;
  endsAtLocal: string;
}): string {
  const start =
    input.scheduleMode === "later" && input.startsAtLocal
      ? new Date(input.startsAtLocal).toLocaleString()
      : "Immediately";

  const end =
    input.expiryMode === "none"
      ? "No automatic end"
      : input.expiryMode === "24h"
        ? "Ends after 24 hours"
        : input.expiryMode === "7d"
          ? "Ends after 7 days"
          : input.endsAtLocal
            ? `Ends ${new Date(input.endsAtLocal).toLocaleString()}`
            : "Custom end not set";

  return `${start} · ${end}`;
}
