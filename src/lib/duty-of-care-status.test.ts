import { describe, it, expect } from "vitest";
import { dutyLevelFromState } from "./duty-of-care-status";
import { roleHasPermission } from "./auth";
import { DUTY_OF_CARE_RESET_ROLES } from "./roles.server";

describe("dutyLevelFromState", () => {
  it("maps the database RAG states onto the roster's badge levels", () => {
    expect(dutyLevelFromState("red")).toBe("overdue");
    expect(dutyLevelFromState("amber")).toBe("due_soon");
    expect(dutyLevelFromState("green")).toBe("up_to_date");
    // A met Tier 3 season is a satisfied requirement, not a missing one.
    expect(dutyLevelFromState("complete")).toBe("up_to_date");
    expect(dutyLevelFromState("not_required")).toBe("not_required");
    expect(dutyLevelFromState("off_season")).toBe("not_required");
  });

  it("never invents a status for an unknown, missing or unread row", () => {
    expect(dutyLevelFromState("no_data")).toBe("not_enough_data");
    expect(dutyLevelFromState(null)).toBe("not_enough_data");
    expect(dutyLevelFromState(undefined)).toBe("not_enough_data");
    expect(dutyLevelFromState("something-new")).toBe("not_enough_data");
  });
});

describe("duty-of-care reset authorisation", () => {
  it("offers the reset to exactly the roles the RLS policy admits", () => {
    // The UI gate and the server/RLS gate must not drift apart.
    expect([...DUTY_OF_CARE_RESET_ROLES].sort()).toEqual([
      "admin",
      "mentor_manager",
      "super_admin",
    ]);
    expect(roleHasPermission("mentor_manager", "duty_of_care.reset")).toBe(true);
    expect(roleHasPermission("admin", "duty_of_care.reset")).toBe(true);
    expect(roleHasPermission("super_admin", "duty_of_care.reset")).toBe(true);
    expect(roleHasPermission("mentor", "duty_of_care.reset")).toBe(false);
  });
});
