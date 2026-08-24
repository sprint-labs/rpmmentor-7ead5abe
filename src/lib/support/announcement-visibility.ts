/**
 * Pure announcement visibility rules for the bell and the incident banner.
 *
 * The banner is driven by active + window + kind, never by read state.
 * Dismissing an incident removes it from the bell list only.
 */
import type { AnnouncementKind } from "./schema";

export interface AnnouncementVisibilityInput {
  kind: AnnouncementKind;
  active: boolean;
  startsAt: string;
  endsAt: string | null;
  readAt: string | null;
  now?: number;
}

function inWindow(input: AnnouncementVisibilityInput, nowMs: number): boolean {
  if (!input.active) return false;
  const starts = Date.parse(input.startsAt);
  if (!Number.isFinite(starts) || starts > nowMs) return false;
  if (input.endsAt) {
    const ends = Date.parse(input.endsAt);
    if (Number.isFinite(ends) && ends <= nowMs) return false;
  }
  return true;
}

export function isAnnouncementInBell(input: AnnouncementVisibilityInput): boolean {
  const nowMs = input.now ?? Date.now();
  if (!inWindow(input, nowMs)) return false;
  return input.readAt == null;
}

export function isAnnouncementBannerVisible(input: AnnouncementVisibilityInput): boolean {
  const nowMs = input.now ?? Date.now();
  if (!inWindow(input, nowMs)) return false;
  return input.kind === "incident" || input.kind === "downtime";
}
