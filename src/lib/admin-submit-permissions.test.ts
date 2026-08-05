import { describe, expect, it } from "vitest";
import { roleHasPermission, type Role } from "@/lib/auth";
import { hasAnyRole, REPORT_SUBMIT_ROLES } from "@/lib/roles.server";

const ROLES: Role[] = ["super_admin", "admin", "mentor_manager", "mentor"];

describe("admin submission permissions", () => {
  it("lets an admin log interactions and submit Match Reports in the UI", () => {
    expect(roleHasPermission("admin", "interactions.log")).toBe(true);
    expect(roleHasPermission("admin", "reports.submit")).toBe(true);
  });

  it("keeps the client and server Match Report allowlists aligned for every role", () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, "reports.submit")).toBe(true);
      expect(hasAnyRole([role], REPORT_SUBMIT_ROLES)).toBe(true);
    }
  });

  it("does not authorise an absent role", () => {
    expect(hasAnyRole([], REPORT_SUBMIT_ROLES)).toBe(false);
  });
});
