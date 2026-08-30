import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addDateOnlyDays,
  bulletinAccessForRoles,
  clampBulletinCreateStatus,
  getLondonAttentionWindow,
  mineScopeCreateOwner,
  sanitiseBulletinSearch,
} from "./server-helpers";

describe("Bulletin Board role decisions", () => {
  it("gives mentors a caller-scoped view without team management", () => {
    expect(bulletinAccessForRoles(["mentor"], "mine")).toEqual({
      canView: true,
      canManage: false,
      restrictToUser: true,
      effectiveScope: "mine",
      canSelfOwn: true,
    });
  });

  it("gives every management role the team-wide view only when team is requested", () => {
    for (const role of ["mentor_manager", "admin", "super_admin"] as const) {
      expect(bulletinAccessForRoles([role], "team")).toEqual({
        canView: true,
        canManage: true,
        restrictToUser: false,
        effectiveScope: "team",
        canSelfOwn: role === "mentor_manager",
      });
    }
  });

  it("gives management actors caller-scoped access while they request mine", () => {
    expect(bulletinAccessForRoles(["mentor_manager"], "mine")).toEqual({
      canView: true,
      canManage: false,
      restrictToUser: true,
      effectiveScope: "mine",
      canSelfOwn: true,
    });
    for (const role of ["admin", "super_admin"] as const) {
      expect(bulletinAccessForRoles([role], "mine")).toEqual({
        canView: true,
        canManage: false,
        restrictToUser: true,
        effectiveScope: "mine",
        canSelfOwn: false,
      });
    }
  });

  it("clamps a mentor's team request back to mine", () => {
    expect(bulletinAccessForRoles(["mentor"], "team")).toEqual({
      canView: true,
      canManage: false,
      restrictToUser: true,
      effectiveScope: "mine",
      canSelfOwn: true,
    });
  });

  it("fails closed for a roleless account and honours a second stored management role", () => {
    expect(bulletinAccessForRoles([], "team")).toEqual({
      canView: false,
      canManage: false,
      restrictToUser: false,
      effectiveScope: "mine",
      canSelfOwn: false,
    });
    expect(bulletinAccessForRoles(["mentor", "admin"], "team").canManage).toBe(true);
    expect(bulletinAccessForRoles(["mentor", "admin"], "mine").canManage).toBe(false);
  });

  it("keeps a Super Admin mine-scope create open but unassigned", () => {
    const access = bulletinAccessForRoles(["super_admin"], "mine");
    expect(
      mineScopeCreateOwner(access, "11111111-1111-4111-8111-111111111111", "Sam Admin"),
    ).toEqual({ ownerId: null, ownerName: null });
    expect(access.canManage).toBe(false);
    expect(clampBulletinCreateStatus(access, "blocked")).toBe("open");
  });

  it("keeps team-scope management owner and status choices unchanged", () => {
    const access = bulletinAccessForRoles(["super_admin"], "team");
    expect(access.canManage).toBe(true);
    expect(clampBulletinCreateStatus(access, "blocked")).toBe("blocked");
  });

  it("self-assigns a real Mentor Manager's mine-scope create", () => {
    const access = bulletinAccessForRoles(["mentor_manager"], "mine");
    expect(
      mineScopeCreateOwner(access, "22222222-2222-4222-8222-222222222222", "Morgan Mentor"),
    ).toEqual({
      ownerId: "22222222-2222-4222-8222-222222222222",
      ownerName: "Morgan Mentor",
    });
  });
});

describe("Europe/London attention dates", () => {
  it("uses the London date after the BST UTC-day boundary", () => {
    expect(getLondonAttentionWindow(new Date("2026-08-28T23:30:00.000Z"))).toEqual({
      today: "2026-08-29",
      dueSoonThrough: "2026-09-05",
    });
  });

  it("stays on Greenwich Mean Time before the spring clock change", () => {
    expect(getLondonAttentionWindow(new Date("2026-03-29T00:30:00.000Z")).today).toBe("2026-03-29");
  });

  it("adds calendar days safely across month, leap-year and DST boundaries", () => {
    expect(addDateOnlyDays("2026-03-27", 7)).toBe("2026-04-03");
    expect(addDateOnlyDays("2028-02-27", 2)).toBe("2028-02-29");
  });
});

describe("Bulletin Board server query safeguards", () => {
  it("removes PostgREST expression punctuation from search text", () => {
    expect(sanitiseBulletinSearch("  50% club_(north), 'urgent'  ")).toBe("50 club north urgent");
  });

  it("keeps paging, own-or-created scoping and compare-and-swap in the data layer", () => {
    const source = readFileSync(new URL("../bulletins.functions.ts", import.meta.url), "utf8");
    expect(source).toMatch(
      /created_by\.eq\.\$\{context\.userId\},owner_id\.eq\.\$\{context\.userId\}/,
    );
    expect(source).toMatch(/\.range\(from, from \+ data\.pageSize - 1\)/);
    expect(source).toMatch(/\.range\(updatesFrom, updatesFrom \+ data\.updatesPageSize - 1\)/);
    expect(source).toMatch(/\.eq\("version", expectedVersion\)/);
    expect(source).toMatch(
      /requireBulletinAccess\(context\.supabase, context\.userId, data\.scope\)/,
    );
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\.limit\((?:200|500)\)/);
  });
});
