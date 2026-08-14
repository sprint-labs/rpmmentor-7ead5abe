import { describe, expect, it } from "vitest";
import { Constants } from "@/integrations/supabase/types";
import {
  hasAnyRole,
  USER_DIRECTORY_VIEW_ROLES,
  type AppRole,
} from "@/lib/roles.server";

const GENERATED_ROLES = Constants.public.Enums.app_role;

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
});
