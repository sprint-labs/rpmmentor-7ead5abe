import { describe, expect, it } from "vitest";
import { resolveActualRole } from "@/lib/auth";

describe("resolveActualRole", () => {
  it("keeps an account with no stored role roleless", () => {
    expect(resolveActualRole([])).toBeNull();
  });

  it("does not convert an unknown stored value into Mentor access", () => {
    expect(resolveActualRole(["unknown"])).toBeNull();
  });

  it("resolves an explicitly stored Mentor role", () => {
    expect(resolveActualRole(["mentor"])).toBe("mentor");
  });

  it("uses the established role precedence when more than one role exists", () => {
    expect(resolveActualRole(["mentor", "mentor_manager"])).toBe("mentor_manager");
    expect(resolveActualRole(["mentor_manager", "admin"])).toBe("admin");
    expect(resolveActualRole(["admin", "super_admin"])).toBe("super_admin");
  });
});
