import { describe, it, expect } from "vitest";
import { DUTY_SEVERITY, dutyLevelFromState } from "./duty-of-care-status";
import { DUTY_LABELS, type DutyLevel } from "./mock-data";
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

describe("DUTY_SEVERITY", () => {
  const LEVELS: DutyLevel[] = [
    "up_to_date",
    "due_soon",
    "overdue",
    "not_required",
    "not_enough_data",
  ];

  it("orders the roster worst first", () => {
    expect([...LEVELS].sort((a, b) => DUTY_SEVERITY[a] - DUTY_SEVERITY[b])).toEqual([
      "overdue",
      "due_soon",
      "up_to_date",
      "not_enough_data",
      "not_required",
    ]);
  });

  it("is not the order the labels sort in", () => {
    // Sorting the Duty of Care column on `label` is alphabetical, which puts
    // Overdue fourth of five. This is the trap the rank exists to avoid.
    const byLabel = [...LEVELS].sort((a, b) => DUTY_LABELS[a].localeCompare(DUTY_LABELS[b]));

    expect(byLabel.indexOf("overdue")).toBe(3);
    expect(byLabel[0]).toBe("due_soon");
  });

  it("ranks every level, with no two sharing a place", () => {
    const ranks = LEVELS.map((level) => DUTY_SEVERITY[level]);

    expect(new Set(ranks).size).toBe(LEVELS.length);
    expect(ranks.every((rank) => Number.isInteger(rank))).toBe(true);
  });
});
