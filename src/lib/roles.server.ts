/**
 * Server-side role lookup.
 *
 * Row Level Security is the backstop that actually protects the data, but every
 * privileged server function also checks here first so an unauthorised call
 * fails with a clear message instead of a silent zero-row write. Roles are read
 * from `public.user_roles` using the caller's own session — never taken from
 * client input, a display name, or an email address.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

type AuthedClient = SupabaseClient<Database>;

/**
 * Roles that may correct a player's club, and edit any interaction rather than
 * only their own. Mirrors the `players_update_club_authorised` and
 * `interactions_update_authorised` policies — change both together.
 */
export const CLUB_EDIT_ROLES: readonly AppRole[] = ["mentor_manager", "admin", "super_admin"];
export const INTERACTION_MANAGE_ROLES: readonly AppRole[] = [
  "mentor_manager",
  "admin",
  "super_admin",
];

/** Destructive entity controls are deliberately reserved for Super Admins. */
export const SUPER_ADMIN_ROLES: readonly AppRole[] = ["super_admin"];

/** The support inbox and broadcast controls are deliberately Super Admin only. */
export const SUPPORT_INBOX_ROLES: readonly AppRole[] = ["super_admin"];

/** Every signed-in operational role may open a support thread. */
export const SUPPORT_SEND_ROLES: readonly AppRole[] = [
  "super_admin",
  "admin",
  "mentor_manager",
  "mentor",
];

/** Every operational role may submit a Match Report. */
export const REPORT_SUBMIT_ROLES: readonly AppRole[] = [
  "super_admin",
  "admin",
  "mentor_manager",
  "mentor",
];

/** Management roles may correct or tombstone an existing Match Report. */
export const REPORT_MANAGE_ROLES: readonly AppRole[] = ["super_admin", "admin", "mentor_manager"];

/** Every signed-in operational role may view the read-only user directory. */
export const USER_DIRECTORY_VIEW_ROLES: readonly AppRole[] = [
  "super_admin",
  "admin",
  "mentor_manager",
  "mentor",
];

/** Roles served by the shared management overview on `/`. */
export const OVERVIEW_DASHBOARD_ROLES: readonly AppRole[] = [
  "super_admin",
  "admin",
  "mentor_manager",
];

/** Mirrors the `executive.view` permission enforced by the route. */
export const EXECUTIVE_DASHBOARD_ROLES: readonly AppRole[] = ["super_admin", "admin"];

export async function getUserRoles(supabase: AuthedClient, userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.role);
}

export function hasAnyRole(roles: readonly AppRole[], allowed: readonly AppRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}

/** Throws unless the signed-in user holds one of `allowed`. */
export async function requireRole(
  supabase: AuthedClient,
  userId: string,
  allowed: readonly AppRole[],
  action: string,
): Promise<AppRole[]> {
  const roles = await getUserRoles(supabase, userId);
  if (!hasAnyRole(roles, allowed)) {
    throw new Error(`You do not have permission to ${action}.`);
  }
  return roles;
}
