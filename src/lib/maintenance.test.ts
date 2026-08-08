import { describe, expect, it } from "vitest";
import { isRestrictedDuringMaintenance } from "./maintenance";

describe("temporary maintenance access", () => {
  it.each(["admin", "mentor_manager", "mentor"])("restricts %s accounts", (role) => {
    expect(isRestrictedDuringMaintenance({ role, actualRole: role })).toBe(true);
  });

  it("allows a Super Admin account", () => {
    expect(isRestrictedDuringMaintenance({ role: "super_admin", actualRole: "super_admin" })).toBe(
      false,
    );
  });

  it("allows a Super Admin who is previewing the mentor interface", () => {
    expect(isRestrictedDuringMaintenance({ role: "mentor", actualRole: "super_admin" })).toBe(
      false,
    );
  });

  it("does not treat an interface role as a Super Admin bypass", () => {
    expect(isRestrictedDuringMaintenance({ role: "super_admin", actualRole: "mentor" })).toBe(true);
  });

  it("fails closed when the actual database role is unavailable", () => {
    expect(isRestrictedDuringMaintenance({ role: "super_admin" })).toBe(true);
  });

  it("does not restrict anonymous visitors before authentication", () => {
    expect(isRestrictedDuringMaintenance(null)).toBe(false);
  });
});
