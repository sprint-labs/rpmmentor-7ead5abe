import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MANUAL_INTERACTION_TYPES } from "@/lib/interactions/schema";
import { requireRole, USER_DIRECTORY_VIEW_ROLES } from "@/lib/roles.server";
import { effectiveRole, splitPersonName, type UserActivityRow } from "@/lib/users-and-roles";

export const listUsersAndRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UserActivityRow[]> => {
    await requireRole(
      context.supabase,
      context.userId,
      USER_DIRECTORY_VIEW_ROLES,
      "view users and roles",
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id,name").order("name"),
        supabaseAdmin.from("user_roles").select("user_id,role"),
      ]);

    if (profilesError || rolesError) {
      throw new Error("Could not load Users & Roles.");
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
        };
      }),
    );
  });
