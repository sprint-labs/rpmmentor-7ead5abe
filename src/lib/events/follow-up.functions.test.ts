import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertSelfWaivable,
  FOLLOW_UP_MANAGE_ROLES,
  FOLLOW_UP_SELF_WAIVE_ROLES,
} from "./follow-up.functions";

const MENTOR = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function event(overrides: Partial<Parameters<typeof assertSelfWaivable>[0] & object> = {}) {
  return {
    assigned_mentor_id: MENTOR,
    status: "scheduled",
    follow_up_waived_at: null,
    ...overrides,
  };
}

describe("assertSelfWaivable", () => {
  it("lets the assigned mentor waive their own open write-up", () => {
    expect(() => assertSelfWaivable(event(), MENTOR)).not.toThrow();
  });

  it("refuses an event assigned to someone else", () => {
    expect(() => assertSelfWaivable(event({ assigned_mentor_id: OTHER }), MENTOR)).toThrow(
      /assigned to you/,
    );
  });

  it("refuses an unassigned or missing event", () => {
    expect(() => assertSelfWaivable(event({ assigned_mentor_id: null }), MENTOR)).toThrow(
      /assigned to you/,
    );
    expect(() => assertSelfWaivable(null, MENTOR)).toThrow(/assigned to you/);
  });

  it("refuses a cancelled event", () => {
    expect(() => assertSelfWaivable(event({ status: "cancelled" }), MENTOR)).toThrow(/cancelled/);
  });

  it("refuses a write-up that is already waived", () => {
    expect(() =>
      assertSelfWaivable(event({ follow_up_waived_at: "2026-10-02T10:00:00Z" }), MENTOR),
    ).toThrow(/already/);
  });
});

describe("follow-up waiver roles", () => {
  it("lets mentors waive only their own write-ups, never everyone's", () => {
    expect(FOLLOW_UP_SELF_WAIVE_ROLES).toContain("mentor");
    expect(FOLLOW_UP_MANAGE_ROLES).not.toContain("mentor");
  });

  it("re-checks assignment, cancellation and waiver on the privileged write", () => {
    const source = readFileSync(new URL("./follow-up.functions.ts", import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("export const waiveMyEventFollowUp"));
    const write = handler.slice(handler.indexOf("supabaseAdmin\n"));
    expect(write).toContain('.eq("assigned_mentor_id", context.userId)');
    expect(write).toContain('.neq("status", "cancelled")');
    expect(write).toContain('.is("follow_up_waived_at", null)');
  });
});
