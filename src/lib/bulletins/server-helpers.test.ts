import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addDateOnlyDays,
  bulletinAccessForRoles,
  getLondonAttentionWindow,
  sanitiseBulletinSearch,
} from "./server-helpers";

describe("Bulletin Board role decisions", () => {
  it("gives mentors the same team board as management when team is requested", () => {
    expect(bulletinAccessForRoles(["mentor"], "team")).toEqual({
      canView: true,
      canManage: true,
      restrictToUser: false,
      effectiveScope: "team",
    });
  });

  it("gives every operational management role the team-wide view only when team is requested", () => {
    for (const role of ["mentor", "mentor_manager", "admin", "super_admin"] as const) {
      expect(bulletinAccessForRoles([role], "team")).toEqual({
        canView: true,
        canManage: true,
        restrictToUser: false,
        effectiveScope: "team",
      });
    }
  });

  it("gives management actors caller-scoped access while they request mine", () => {
    for (const role of ["mentor", "mentor_manager", "admin", "super_admin"] as const) {
      expect(bulletinAccessForRoles([role], "mine")).toEqual({
        canView: true,
        canManage: false,
        restrictToUser: true,
        effectiveScope: "mine",
      });
    }
  });

  it("fails closed for a roleless account and honours a second stored management role", () => {
    expect(bulletinAccessForRoles([], "team")).toEqual({
      canView: false,
      canManage: false,
      restrictToUser: false,
      effectiveScope: "mine",
    });
    expect(bulletinAccessForRoles(["mentor", "admin"], "team").canManage).toBe(true);
    expect(bulletinAccessForRoles(["mentor", "admin"], "mine").canManage).toBe(false);
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

  it("keeps paging, current-owner scoping and compare-and-swap in the data layer", () => {
    const source = readFileSync(new URL("../bulletins.functions.ts", import.meta.url), "utf8");
    expect(source.match(/\.eq\("owner_id", (?:userId|context\.userId)\)/g)).toHaveLength(4);
    expect(source).not.toMatch(/created_by\.eq/);
    expect(source).toMatch(/\.range\(from, from \+ data\.pageSize - 1\)/);
    expect(source).toMatch(/\.range\(updatesFrom, updatesFrom \+ data\.updatesPageSize - 1\)/);
    expect(source).toMatch(/\.eq\("version", expectedVersion\)/);
    expect(source).toMatch(
      /requireBulletinAccess\(context\.supabase, context\.userId, data\.scope\)/,
    );
    expect(source).toMatch(/Only Bulletin Board management can create work/);
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\.limit\((?:200|500)\)/);
  });
});
