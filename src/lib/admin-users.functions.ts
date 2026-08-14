import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ROLE_VALUES = ["super_admin", "admin", "mentor_manager", "mentor"] as const;
type ManagedRole = (typeof ROLE_VALUES)[number];

export interface ManagedUserRow {
  id: string;
  email: string;
  name: string;
  initials: string;
  title: string;
  role: ManagedRole | null;
}

function precedence(roles: string[]): ManagedRole | null {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("mentor_manager")) return "mentor_manager";
  if (roles.includes("mentor")) return "mentor";
  return null;
}

export const listManagedUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUserRow[]> => {
    const { data: myRoles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles, error: profErr }, { data: roles, error: rolesErr }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id,email,name,initials,title").order("email"),
        supabaseAdmin.from("user_roles").select("user_id,role"),
      ]);
    if (profErr) throw new Error(profErr.message);
    if (rolesErr) throw new Error(rolesErr.message);

    const byUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = byUser.get(r.user_id) ?? [];
      arr.push(r.role as string);
      byUser.set(r.user_id, arr);
    }

    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email ?? "",
      name: p.name ?? "",
      initials: p.initials ?? "",
      title: p.title ?? "",
      role: precedence(byUser.get(p.id) ?? []),
    }));
  });

const setRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLE_VALUES).nullable(),
});

export const setManagedUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => setRoleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: myRoles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    if (data.userId === context.userId) {
      throw new Error("You cannot change your own role from this screen.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);

    if (data.role) {
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (insErr) throw new Error(insErr.message);
    }

    return { ok: true as const };
  });

const createUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  title: z.string().max(120).optional().default(""),
  role: z.enum(ROLE_VALUES).nullable(),
  password: z.string().min(8).max(200).optional(),
});

function initialsOf(name: string, email: string): string {
  const src = (name || email).trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export const createManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => createUserInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: myRoles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const password = data.password ?? `${crypto.randomUUID().replace(/-/g, "")}Aa1!`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: {
        name: data.name,
        title: data.title ?? "",
        initials: initialsOf(data.name, data.email),
      },
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message ?? "Failed to create user");
    }

    const userId = created.user.id;

    // handle_new_user trigger seeds profile + default mentor role.
    // Upsert to ensure fields are correct, then set the requested role.
    const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: data.email,
      name: data.name,
      title: data.title ?? "",
      initials: initialsOf(data.name, data.email),
    });
    if (profErr) throw new Error(profErr.message);

    const { error: delRolesErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (delRolesErr) throw new Error(delRolesErr.message);

    if (data.role) {
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: data.role });
      if (insErr) throw new Error(insErr.message);
    }

    return { ok: true as const, userId, tempPassword: data.password ? null : password };
  });

const inviteUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  title: z.string().max(120).optional().default(""),
  role: z.enum(ROLE_VALUES).nullable(),
  redirectTo: z.string().url(),
});

export const inviteManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => inviteUserInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: myRoles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const initials = initialsOf(data.name, data.email);
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: data.email,
      options: {
        redirectTo: data.redirectTo,
        data: { name: data.name, title: data.title ?? "", initials },
      },
    });
    if (linkErr || !link?.user) {
      throw new Error(linkErr?.message ?? "Failed to generate invite link");
    }

    const userId = link.user.id;

    // Trigger seeded a profile with mentor role; upsert canonical fields and set requested role.
    const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: data.email,
      name: data.name,
      title: data.title ?? "",
      initials,
    });
    if (profErr) throw new Error(profErr.message);

    const { error: delRolesErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (delRolesErr) throw new Error(delRolesErr.message);

    if (data.role) {
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: data.role });
      if (insErr) throw new Error(insErr.message);
    }

    return {
      ok: true as const,
      userId,
      email: data.email,
      inviteLink: link.properties?.action_link ?? "",
    };
  });

const deleteUserInput = z.object({ userId: z.string().uuid() });

export const deleteManagedUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteUserInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: myRoles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    if (data.userId === context.userId) {
      throw new Error("You cannot delete your own account from this screen.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Snapshot who is being deleted and what will be affected, before deletion.
    const [{ data: target }, { data: targetRoles }, { data: actorProfile }] = await Promise.all([
      supabaseAdmin.from("profiles").select("email,name").eq("id", data.userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
      supabaseAdmin.from("profiles").select("email,name").eq("id", context.userId).maybeSingle(),
    ]);

    const countOf = async (
      table:
        | "interactions"
        | "calendar_events"
        | "dashboard_click_events"
        | "match_report_submissions"
        | "interaction_media",
      column: string,
    ) => {
      const { count } = await supabaseAdmin
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(column, data.userId);
      return count ?? 0;
    };

    const [interactions, calendarEvents, clickEvents, submissions, mediaLinks] = await Promise.all([
      countOf("interactions", "mentor_id"),
      countOf("calendar_events", "created_by"),
      countOf("dashboard_click_events", "user_id"),
      countOf("match_report_submissions", "user_id"),
      countOf("interaction_media", "attached_by"),
    ]);

    const sections = [
      { section: "Account (sign-in)", records: 1, action: "deleted" },
      { section: "Profile", records: target ? 1 : 0, action: "deleted" },
      { section: "Roles", records: targetRoles?.length ?? 0, action: "deleted" },
      { section: "Interactions", records: interactions, action: "unassigned" },
      { section: "Calendar events", records: calendarEvents, action: "unassigned" },
      { section: "Match report submissions", records: submissions, action: "retained" },
      { section: "Interaction media links", records: mediaLinks, action: "retained" },
      { section: "Dashboard analytics events", records: clickEvents, action: "retained" },
    ].filter((s) => s.records > 0);

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (delErr) throw new Error(delErr.message);

    // profiles and user_roles rows cascade via FK on auth.users delete.
    await supabaseAdmin.from("user_deletion_audit").insert({
      deleted_user_id: data.userId,
      deleted_email: target?.email ?? "",
      deleted_name: target?.name ?? "",
      deleted_role: precedence((targetRoles ?? []).map((r) => r.role as string)),
      actor_id: context.userId,
      actor_email: actorProfile?.email ?? "",
      actor_name: actorProfile?.name ?? "",
      affected_sections: sections,
    });

    return { ok: true as const, affectedSections: sections };
  });

export interface DeletionAuditRow {
  id: string;
  createdAt: string;
  deletedEmail: string;
  deletedName: string;
  deletedRole: string | null;
  actorEmail: string;
  actorName: string;
  sections: { section: string; records: number; action: string }[];
}

export const listUserDeletionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeletionAuditRow[]> => {
    const { data: myRoles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    const { data, error } = await context.supabase
      .from("user_deletion_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      deletedEmail: (r.deleted_email as string) ?? "",
      deletedName: (r.deleted_name as string) ?? "",
      deletedRole: (r.deleted_role as string | null) ?? null,
      actorEmail: (r.actor_email as string) ?? "",
      actorName: (r.actor_name as string) ?? "",
      sections: Array.isArray(r.affected_sections)
        ? (r.affected_sections as { section: string; records: number; action: string }[])
        : [],
    }));
  });

const resetPasswordInput = z.object({ userId: z.string().uuid() });

export const resetManagedUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => resetPasswordInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: myRoles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleErr) throw new Error(roleErr.message);
    if (!myRoles?.some((r) => r.role === "super_admin")) throw new Error("Forbidden");

    if (data.userId === context.userId) {
      throw new Error("You cannot reset your own password from this screen.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tempPassword = `${crypto.randomUUID().replace(/-/g, "")}Aa1!`;

    const { data: updated, error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: tempPassword },
    );
    if (updErr || !updated?.user) {
      throw new Error(updErr?.message ?? "Failed to reset password");
    }

    const { logPasswordChange } = await import("@/lib/security/password-audit.server");
    await logPasswordChange({
      userId: data.userId,
      actorId: context.userId,
      eventType: "admin_reset",
    });

    return { ok: true as const, email: updated.user.email ?? "", tempPassword };
  });
