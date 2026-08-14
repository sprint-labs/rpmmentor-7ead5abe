import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mentor dashboard upcoming events", () => {
  it("scopes the calendar read to the signed-in assigned mentor", () => {
    const source = readFileSync(new URL("./mentor-dashboard.functions.ts", import.meta.url), "utf8");
    expect(source).toMatch(/\.eq\("assigned_mentor_id", userId\)/);
    expect(source).not.toMatch(/has no assigned-mentor column/);
    expect(source).toMatch(/assigned_mentor_id` is the signed-in profile/);
  });
});
