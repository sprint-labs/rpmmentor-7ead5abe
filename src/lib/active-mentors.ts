import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const ACTIVE_MENTOR_ROLES = ["mentor", "mentor_manager"] as const;

export function hasActiveMentorAccess(role: string | null | undefined): boolean {
  return (ACTIVE_MENTOR_ROLES as readonly string[]).includes(role ?? "");
}

export function countDistinctMentorAccounts(rows: ReadonlyArray<{ id: string }>): number {
  return new Set(rows.map((row) => row.id)).size;
}

/**
 * Count the current mentor rotation without attempting to read `user_roles`
 * through its deliberately own-row-only RLS policy. The narrow database RPC
 * exposes only assignable mentor and mentor-manager profiles.
 */
export async function getActiveMentorCount(supabase: SupabaseClient<Database>): Promise<number> {
  const { data, error } = await supabase.rpc("list_mentor_directory");
  if (error) throw new Error("Could not load active mentors.");
  return countDistinctMentorAccounts(data ?? []);
}
