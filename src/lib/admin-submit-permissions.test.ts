import { describe, expect, it } from "vitest";
import { roleHasPermission, type Role } from "@/lib/auth";
import {
  hasAnyRole,
  INTERACTION_LOG_ROLES,
  INTERACTION_MANAGE_ROLES,
  REPORT_MANAGE_ROLES,
  REPORT_SUBMIT_ROLES,
} from "@/lib/roles.server";

const ROLES: Role[] = ["super_admin", "admin", "mentor_manager", "mentor"];

/** The roles that record mentoring work, as opposed to overseeing it. */
const RECORDING_ROLES: Role[] = ["super_admin", "mentor_manager", "mentor"];

describe("admin submission permissions", () => {
  it("does not offer an admin the Log Interaction or Submit Match Report controls", () => {
    expect(roleHasPermission("admin", "interactions.log")).toBe(false);
    expect(roleHasPermission("admin", "reports.submit")).toBe(false);
  });

  it("refuses an admin server-side, so a hidden button is not the only guard", () => {
    expect(hasAnyRole(["admin"], INTERACTION_LOG_ROLES)).toBe(false);
    expect(hasAnyRole(["admin"], REPORT_SUBMIT_ROLES)).toBe(false);
  });

  it("keeps an admin's oversight of work other people recorded", () => {
    expect(roleHasPermission("admin", "interactions.view")).toBe(true);
    expect(roleHasPermission("admin", "interactions.manage")).toBe(true);
    expect(roleHasPermission("admin", "reports.view")).toBe(true);
    expect(roleHasPermission("admin", "reports.manage")).toBe(true);
    expect(hasAnyRole(["admin"], INTERACTION_MANAGE_ROLES)).toBe(true);
    expect(hasAnyRole(["admin"], REPORT_MANAGE_ROLES)).toBe(true);
  });

  it("leaves every recording role able to log and submit", () => {
    for (const role of RECORDING_ROLES) {
      expect(roleHasPermission(role, "interactions.log")).toBe(true);
      expect(roleHasPermission(role, "reports.submit")).toBe(true);
    }
  });

  it("keeps the client and server allowlists aligned for every role", () => {
    for (const role of ROLES) {
      expect(hasAnyRole([role], REPORT_SUBMIT_ROLES)).toBe(
        roleHasPermission(role, "reports.submit"),
      );
      expect(hasAnyRole([role], INTERACTION_LOG_ROLES)).toBe(
        roleHasPermission(role, "interactions.log"),
      );
    }
  });

  it("does not authorise an absent role", () => {
    expect(hasAnyRole([], REPORT_SUBMIT_ROLES)).toBe(false);
    expect(hasAnyRole([], INTERACTION_LOG_ROLES)).toBe(false);
  });
});
