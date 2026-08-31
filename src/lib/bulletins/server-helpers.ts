import type { AppRole } from "@/lib/roles.server";
import type { BulletinScope, BulletinStatus } from "./schema";

export const BULLETIN_VIEW_ROLES: readonly AppRole[] = [
  "super_admin",
  "admin",
  "mentor_manager",
];

export const BULLETIN_MANAGE_ROLES: readonly AppRole[] = ["super_admin", "admin", "mentor_manager"];

/** Roles represented in the assignable mentor directory. */
export const BULLETIN_SELF_OWNER_ROLES: readonly AppRole[] = ["mentor_manager"];

export interface BulletinAccess {
  canView: boolean;
  /** Management capability inside the effective view, not merely the stored role. */
  canManage: boolean;
  /** True when server queries must add the caller-owned/created predicate. */
  restrictToUser: boolean;
  effectiveScope: BulletinScope;
  /** True only when the actor is a real assignable mentor/mentor manager. */
  canSelfOwn: boolean;
}

/**
 * Clamp a requested UI perspective to durable database permissions.
 *
 * Even a management user gets caller-scoped reads and writes when requesting
 * `mine`. Asking for `team` cannot elevate any other role: unauthorised callers
 * fail closed and receive no query scope.
 */
export function bulletinAccessForRoles(
  roles: readonly AppRole[],
  requestedScope: BulletinScope,
): BulletinAccess {
  const hasManagementRole = roles.some((role) => BULLETIN_MANAGE_ROLES.includes(role));
  const canSelfOwn = roles.some((role) => BULLETIN_SELF_OWNER_ROLES.includes(role));
  const canView = hasManagementRole || roles.some((role) => BULLETIN_VIEW_ROLES.includes(role));
  const effectiveScope: BulletinScope =
    canView && hasManagementRole && requestedScope === "team" ? "team" : "mine";
  const canManage = canView && hasManagementRole && effectiveScope === "team";
  return {
    canView,
    canManage,
    restrictToUser: canView && effectiveScope === "mine",
    effectiveScope,
    canSelfOwn,
  };
}

export interface BulletinCreateOwner {
  ownerId: string | null;
  ownerName: string | null;
}

/**
 * Owner snapshot for a mine-scope create.
 *
 * Admin and Super Admin may preview the Mentor interface without becoming an
 * assignable mentor. Their item remains visible through `created_by`, but is
 * stored unassigned so the database owner invariant remains true.
 */
export function mineScopeCreateOwner(
  access: BulletinAccess,
  actorId: string,
  actorName: string,
): BulletinCreateOwner {
  if (!access.canSelfOwn) return { ownerId: null, ownerName: null };
  return { ownerId: actorId, ownerName: actorName };
}

/** Only a genuine team-management create may choose an initial status. */
export function clampBulletinCreateStatus(
  access: BulletinAccess,
  requestedStatus: BulletinStatus,
): BulletinStatus {
  return access.canManage ? requestedStatus : "open";
}

/** Keep free-text search inside a PostgREST `.or()` expression. */
export function sanitiseBulletinSearch(value: string | undefined): string {
  return (value ?? "")
    .replace(/[%_,()."']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateOnlyInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (!year || !month || !day) throw new Error("Could not calculate the Bulletin Board date.");
  return `${year}-${month}-${day}`;
}

/** Add whole calendar days to a date-only value without local/UTC conversion. */
export function addDateOnlyDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * Stable attention window for the RPM operating timezone.
 *
 * `today` is calculated in Europe/London even when the server process runs in
 * UTC. Due-soon includes today through the next seven calendar days.
 */
export function getLondonAttentionWindow(now: Date = new Date()): {
  today: string;
  dueSoonThrough: string;
} {
  const today = dateOnlyInZone(now, "Europe/London");
  return { today, dueSoonThrough: addDateOnlyDays(today, 7) };
}
