import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Constants } from "@/integrations/supabase/types";
import {
  hasAnyRole,
  SUPER_ADMIN_ROLES,
  SUPPORT_INBOX_ROLES,
  USER_DIRECTORY_VIEW_ROLES,
  type AppRole,
} from "@/lib/roles.server";
import { roleHasPermission, type Role } from "@/lib/auth";

const GENERATED_ROLES = Constants.public.Enums.app_role;
const ROLES: Role[] = ["super_admin", "admin", "mentor_manager", "mentor"];

describe("roles.server", () => {
  it("treats every generated app_role as an AppRole", () => {
    const roles: readonly AppRole[] = GENERATED_ROLES;
    expect([...roles].sort()).toEqual([...USER_DIRECTORY_VIEW_ROLES].sort());
  });

  it("hasAnyRole is true when any stored role is in the allowed set", () => {
    expect(hasAnyRole(["mentor"], ["mentor_manager", "admin"])).toBe(false);
    expect(hasAnyRole(["mentor", "admin"], ["mentor_manager", "admin"])).toBe(true);
    expect(hasAnyRole([], ["super_admin"])).toBe(false);
  });

  it("keeps Bulletin Board access exclusive to management roles", () => {
    for (const role of ROLES) {
      const expected = role !== "mentor";
      expect(roleHasPermission(role, "bulletins.view")).toBe(expected);
      expect(roleHasPermission(role, "bulletins.manage")).toBe(expected);
    }
  });

  it("keeps the Bulletin Board card off the Mentor dashboard", () => {
    const source = readFileSync(
      new URL("../components/mentor/mentor-dashboard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/BulletinDashboardCard/);
  });

  it("keeps destructive entity controls exclusive to Super Admin", () => {
    expect(SUPER_ADMIN_ROLES).toEqual(["super_admin"]);

    for (const role of ROLES) {
      const expected = role === "super_admin";
      expect(hasAnyRole([role], SUPER_ADMIN_ROLES)).toBe(expected);
      expect(roleHasPermission(role, "interactions.delete")).toBe(expected);
      expect(roleHasPermission(role, "players.manage")).toBe(expected);
    }
  });

  it("keeps System Alerts exclusive to Super Admin", () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, "alerts.view")).toBe(role === "super_admin");
    }
  });

  it("keeps the support inbox exclusive to Super Admin and support.send on every role", () => {
    expect(SUPPORT_INBOX_ROLES).toEqual(["super_admin"]);
    for (const role of ROLES) {
      expect(roleHasPermission(role, "support.inbox")).toBe(role === "super_admin");
      expect(roleHasPermission(role, "support.send")).toBe(true);
    }
  });
});
