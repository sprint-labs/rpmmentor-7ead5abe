import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANUAL_INTERACTION_TYPES } from "@/lib/interactions/schema";
import { requireRole, USER_DIRECTORY_VIEW_ROLES } from "@/lib/roles.server";
import { effectiveRole, splitPersonName, type UserActivityRow } from "@/lib/users-and-roles";
import { resolveCoachIdentity } from "@/lib/mentor-dashboard-report-count";

export const listUsersAndRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserActivityRow[]> => {
    await requireRole(
      context.supabase,
      context.userId,
      USER_DIRECTORY_VIEW_ROLES,
      "view team members",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // auth.users isn't a queryable table — the Admin API is the only way to
    // read last_sign_in_at, and it's paginated regardless of how few accounts
    // exist, so every page is walked until a short page ends the list.
    const loadLastSignIns = async (): Promise<Map<string, string | null>> => {
      const byUser = new Map<string, string | null>();
      const perPage = 200;
      for (let page = 1; ; page++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) throw new Error(error.message);
        for (const authUser of data.users) {
          byUser.set(authUser.id, authUser.last_sign_in_at ?? null);
        }
        if (data.users.length < perPage) break;
      }
      return byUser;
    };

    const [
      { data: profiles, error: profilesError },
      { data: roles, error: rolesError },
      lastLoginByUser,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,name,email").order("name"),
      supabaseAdmin.from("user_roles").select("user_id,role"),
      loadLastSignIns(),
    ]);

    if (profilesError || rolesError) {
      throw new Error("Could not load Team Members.");
    }

    const rolesByUser = new Map<string, string[]>();
    for (const row of roles ?? []) {
      const userRoles = rolesByUser.get(row.user_id) ?? [];
      userRoles.push(row.role as string);
      rolesByUser.set(row.user_id, userRoles);
    }

    return Promise.all(
      (profiles ?? []).map(async (profile): Promise<UserActivityRow> => {
        const [interactionsResult, reportsResult] = await Promise.all([
          supabaseAdmin
            .from("interactions")
            .select("id", { count: "exact", head: true })
            .eq("mentor_id", profile.id)
            .is("deleted_at", null)
            .in("interaction_type", [...MANUAL_INTERACTION_TYPES]),
          supabaseAdmin
            .from("match_report_submissions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", profile.id)
            .eq("status", "succeeded"),
        ]);

        if (
          interactionsResult.error ||
          reportsResult.error ||
          typeof interactionsResult.count !== "number" ||
          typeof reportsResult.count !== "number"
        ) {
          throw new Error("Could not load user activity totals.");
        }

        return {
          id: profile.id,
          ...splitPersonName(profile.name ?? ""),
          role: effectiveRole(rolesByUser.get(profile.id) ?? []),
          matchReportsSubmitted: reportsResult.count,
          interactionsLogged: interactionsResult.count,
          coachIdentity: resolveCoachIdentity({ name: profile.name, email: profile.email }),
          lastLoginAt: lastLoginByUser.get(profile.id) ?? null,
        };
      }),
    );
  });
