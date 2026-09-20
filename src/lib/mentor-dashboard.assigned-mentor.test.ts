import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mentor dashboard upcoming events", () => {
  it("scopes the calendar read to the signed-in assigned mentor", () => {
    const source = readFileSync(
      new URL("./mentor-dashboard.functions.ts", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/\.eq\("assigned_mentor_id", userId\)/);
    expect(source).not.toMatch(/has no assigned-mentor column/);
    expect(source).toMatch(/assigned_mentor_id` is the signed-in profile/);
  });

  it("drops cancelled fixtures, matching the month grid above the list", () => {
    const source = readFileSync(
      new URL("./mentor-dashboard.functions.ts", import.meta.url),
      "utf8",
    );
    const upcoming = source.slice(source.indexOf("export const getMentorDashboardStats"));
    expect(upcoming).toMatch(/from\("calendar_events"\)[\s\S]*\.neq\("status", "cancelled"\)/);
  });

  it("does not feed the month panel from the oldest 1000 team-wide rows", () => {
    const source = readFileSync(
      new URL("../components/mentor/mentor-dashboard.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toMatch(/useServerFn\(listAssignedCalendarEvents\)/);
    expect(source).not.toMatch(/useServerFn\(listCalendarEvents\)/);
  });
});
