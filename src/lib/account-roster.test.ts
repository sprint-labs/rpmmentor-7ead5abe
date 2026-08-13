import { describe, expect, it } from "vitest";
import { DEMO_USERS, roleHasPermission, type Role } from "@/lib/auth";

/**
 * The roster provisioned in the live project. `public.user_roles` stays the only
 * authority for real permissions; this guards the repository's reference
 * directory against drifting back to a role the database does not grant.
 */
const PROVISIONED_ROLES: Record<string, Role> = {
  "Luke Corrigan": "super_admin",
  "Rich Lee": "mentor_manager",
  "David Rouse": "mentor_manager",
  "Matt Beadle": "mentor_manager",
  "Dave Watson": "mentor",
  "Andy Marshall": "mentor",
  "Alec Chamberlain": "mentor",
  "Martyn Margetson": "mentor",
  "Martijn Middelbeek": "mentor",
  "Gavin Ward": "mentor",
};

const ROLES: Role[] = ["super_admin", "admin", "mentor_manager", "mentor"];

describe("Account roster", () => {
  it("names exactly the provisioned people and their provisioned role", () => {
    const roster = Object.fromEntries(DEMO_USERS.map((user) => [user.name, user.role]));
    expect(roster).toEqual(PROVISIONED_ROLES);
  });

  it("holds no duplicate identity", () => {
    expect(new Set(DEMO_USERS.map((user) => user.id)).size).toBe(DEMO_USERS.length);
    expect(new Set(DEMO_USERS.map((user) => user.email)).size).toBe(DEMO_USERS.length);
    expect(new Set(DEMO_USERS.map((user) => user.name)).size).toBe(DEMO_USERS.length);
  });

  it("keeps real contact addresses out of the repository", () => {
    const leaked = DEMO_USERS.filter((user) => !user.email.endsWith("@gkhq.app"));
    expect(leaked).toEqual([]);
  });

  it("restricts account management to the one super admin", () => {
    expect(ROLES.filter((role) => roleHasPermission(role, "system.manage"))).toEqual([
      "super_admin",
    ]);
    expect(DEMO_USERS.filter((user) => user.role === "super_admin")).toHaveLength(1);
  });
});
