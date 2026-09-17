import type { Role } from "@/lib/auth";

export interface UserActivityRow {
  id: string;
  firstName: string;
  lastName: string;
  role: Role | null;
  matchReportsSubmitted: number;
  interactionsLogged: number;
  /** The exact coach identity (name, or email if no name) stamped on this
   * user's Match Report submissions — needed to link into /reports filtered
   * to just their reports, since that page filters by that string. */
  coachIdentity: string;
  /** auth.users.last_sign_in_at — null if the account has never signed in. */
  lastLoginAt: string | null;
}

/** Display-only split of the canonical profiles.name value. Never used as an identity join. */
export function splitPersonName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "—",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "—",
  };
}

/** Match the effective-role precedence used by authentication and user management. */
export function effectiveRole(roles: readonly string[]): Role | null {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("mentor_manager")) return "mentor_manager";
  if (roles.includes("mentor")) return "mentor";
  return null;
}
