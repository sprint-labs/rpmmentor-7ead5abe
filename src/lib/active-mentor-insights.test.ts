import { describe, expect, it } from "vitest";
import { buildActiveMentorInsightRows } from "./active-mentor-insights";

describe("active mentor insight rows", () => {
  it("uses RPC directory membership even when the effective display role is higher", () => {
    const rows = buildActiveMentorInsightRows(
      [
        { id: "multi-role", name: "Multi Role", isManager: true },
        { id: "mentor-only", name: "Mentor Only", isManager: false },
      ],
      [
        {
          id: "multi-role",
          firstName: "Multi",
          lastName: "Role",
          role: "super_admin",
          matchReportsSubmitted: 7,
          interactionsLogged: 11,
          coachIdentity: "Multi Role",
          lastLoginAt: null,
        },
        {
          id: "admin-only",
          firstName: "Admin",
          lastName: "Only",
          role: "admin",
          matchReportsSubmitted: 99,
          interactionsLogged: 99,
          coachIdentity: "Admin Only",
          lastLoginAt: null,
        },
      ],
    );

    expect(rows.map((row) => row.id)).toEqual(["multi-role", "mentor-only"]);
    expect(rows[0]).toMatchObject({
      isManager: true,
      matchReportsSubmitted: 7,
      interactionsLogged: 11,
    });
    expect(rows[1]).toMatchObject({
      isManager: false,
      matchReportsSubmitted: 0,
      interactionsLogged: 0,
    });
  });
});
