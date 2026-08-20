import { describe, expect, it } from "vitest";
import { decideMatchReportEditAccess } from "./report-edit-access.functions";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";

describe("Match Report edit access", () => {
  it.each(["mentor_manager", "admin", "super_admin"] as const)(
    "allows %s to manage any report",
    (role) => {
      expect(
        decideMatchReportEditAccess({
          roles: [role],
          userId: USER_ID,
          submittedBy: OTHER_USER_ID,
        }),
      ).toEqual({ canManage: true, isAuthor: false, canEdit: true });
    },
  );

  it("allows an active author to edit their own report", () => {
    expect(
      decideMatchReportEditAccess({
        roles: ["mentor"],
        userId: USER_ID,
        submittedBy: USER_ID,
      }),
    ).toEqual({ canManage: false, isAuthor: true, canEdit: true });
  });

  it("denies an active non-author", () => {
    expect(
      decideMatchReportEditAccess({
        roles: ["mentor"],
        userId: USER_ID,
        submittedBy: OTHER_USER_ID,
      }),
    ).toEqual({ canManage: false, isAuthor: false, canEdit: false });
  });

  it("denies authorship when the report has no authenticated owner", () => {
    expect(
      decideMatchReportEditAccess({
        roles: ["mentor"],
        userId: USER_ID,
        submittedBy: null,
      }),
    ).toEqual({ canManage: false, isAuthor: false, canEdit: false });
  });

  it("denies a roleless or revoked author", () => {
    expect(
      decideMatchReportEditAccess({
        roles: [],
        userId: USER_ID,
        submittedBy: USER_ID,
      }),
    ).toEqual({ canManage: false, isAuthor: false, canEdit: false });
  });
});
