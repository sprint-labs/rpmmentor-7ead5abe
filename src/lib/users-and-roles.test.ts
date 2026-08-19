import { describe, expect, it } from "vitest";
import { roleHasPermission, type Role } from "@/lib/auth";
import {
  EXECUTIVE_DASHBOARD_ROLES,
  OVERVIEW_DASHBOARD_ROLES,
  USER_DIRECTORY_VIEW_ROLES,
} from "@/lib/roles.server";
import { effectiveRole, splitPersonName } from "@/lib/users-and-roles";

const ROLES: Role[] = ["super_admin", "admin", "mentor_manager", "mentor"];

describe("Users & Roles", () => {
  it("splits the canonical display name without using it as an identity", () => {
    expect(splitPersonName("Rich Lee")).toEqual({ firstName: "Rich", lastName: "Lee" });
    expect(splitPersonName("Madonna")).toEqual({ firstName: "Madonna", lastName: "—" });
    expect(splitPersonName("  ")).toEqual({ firstName: "—", lastName: "—" });
  });

  it("uses the established effective-role precedence", () => {
    expect(effectiveRole(["mentor", "admin"])).toBe("admin");
    expect(effectiveRole(["mentor_manager", "super_admin"])).toBe("super_admin");
    expect(effectiveRole([])).toBeNull();
  });

  it("is visible to every recognised app role", () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, "mentors.view")).toBe(true);
      expect(USER_DIRECTORY_VIEW_ROLES).toContain(role);
    }
  });

  it("keeps server-side dashboard access aligned with route permissions", () => {
    expect(OVERVIEW_DASHBOARD_ROLES).toEqual(["super_admin", "admin", "mentor_manager"]);
    expect(EXECUTIVE_DASHBOARD_ROLES).toEqual(["super_admin", "admin"]);
    for (const role of ROLES) {
      expect(EXECUTIVE_DASHBOARD_ROLES.includes(role)).toBe(
        roleHasPermission(role, "executive.view"),
      );
    }
  });
});
