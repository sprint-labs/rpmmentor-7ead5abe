import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  toTeamCalendarEvent,
  validateEvent,
  type CalendarEventSelect,
} from "@/lib/calendar.functions";

const PLAYER = "11111111-1111-4111-8111-111111111111";
const MENTOR = "22222222-2222-4222-8222-222222222222";
const CREATOR = "33333333-3333-4333-8333-333333333333";

function row(overrides: Partial<CalendarEventSelect> = {}): CalendarEventSelect {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Northbridge FC v Riverside — attending",
    event_type: "Match",
    event_date: "2026-08-20",
    start_time: "15:00:00",
    end_time: null,
    location: "Northbridge",
    notes: "",
    participation_status: "not_confirmed",
    player_id: PLAYER,
    goalkeeper_name: "Alex Testkeeper",
    assigned_mentor_id: MENTOR,
    assigned_mentor_name: "Morgan Mentor",
    status: "scheduled",
    cancellation_reason: "",
    follow_up_waived_at: null,
    follow_up_waiver_reason: "",
    created_by: CREATOR,
    created_by_name: "Riley Manager",
    ...overrides,
  };
}

describe("toTeamCalendarEvent", () => {
  it("keeps assigned mentor, follow-up and cancellation fields from the generated row", () => {
    expect(
      toTeamCalendarEvent(
        row({
          follow_up_waived_at: "2026-08-21T12:00:00+01:00",
          follow_up_waiver_reason: "Covered in person",
        }),
      ),
    ).toMatchObject({
      event_type: "Match",
      player_id: PLAYER,
      assigned_mentor_id: MENTOR,
      assigned_mentor_name: "Morgan Mentor",
      status: "scheduled",
      participation_status: "not_confirmed",
      follow_up_waiver_reason: "Covered in person",
    });
  });

  it("maps every schedulable type, including Training Ground Visit", () => {
    for (const eventType of ["Match", "Training Ground Visit", "Coffee Catch-up"]) {
      expect(toTeamCalendarEvent(row({ event_type: eventType })).event_type).toBe(eventType);
    }
  });

  it("keeps retired and free-text types on read so one unfamiliar row cannot blank the list", () => {
    const rows = [
      row({ event_type: "Meeting" }),
      row({ id: "55555555-5555-4555-8555-555555555555", event_type: "Training Ground Visit" }),
      row({ id: "66666666-6666-4666-8666-666666666666", event_type: "Attend Live Match" }),
    ];
    expect(() => rows.map(toTeamCalendarEvent)).not.toThrow();
    expect(rows.map((item) => toTeamCalendarEvent(item).event_type)).toEqual([
      "Meeting",
      "Training Ground Visit",
      "Attend Live Match",
    ]);
  });

  it("allows a null assignee for events scheduled before mentors were assignable", () => {
    expect(
      toTeamCalendarEvent(row({ assigned_mentor_id: null, assigned_mentor_name: "" })),
    ).toMatchObject({
      assigned_mentor_id: null,
      assigned_mentor_name: "",
    });
  });
});

describe("validateEvent still refuses retired types on write", () => {
  it("accepts Training Ground Visit and rejects Meeting", () => {
    const base = {
      title: "Northbridge session",
      event_date: "2026-08-20",
      start_time: "10:00",
      player_id: PLAYER,
      assigned_mentor_id: MENTOR,
    };
    expect(validateEvent({ ...base, event_type: "Training Ground Visit" }).event_type).toBe(
      "Training Ground Visit",
    );
    expect(() => validateEvent({ ...base, event_type: "Meeting" })).toThrow(/Match, Training Ground/i);
  });
});

describe("calendar event query columns", () => {
  it("selects follow-up and assigned-mentor columns and maps rows instead of casting them", () => {
    const source = readFileSync(new URL("./calendar.functions.ts", import.meta.url), "utf8");
    expect(source).toMatch(/assigned_mentor_id, assigned_mentor_name/);
    expect(source).toMatch(/follow_up_waived_at, follow_up_waiver_reason/);
    expect(source).toMatch(/participation_status/);
    expect(source).toMatch(/list_mentor_directory/);
    expect(source).toMatch(/notifyEventAssigned/);
    expect(source).not.toMatch(/as TeamCalendarEvent/);
    expect(source).not.toMatch(/as TeamCalendarEvent\[\]/);
  });

  it("defaults newly scheduled Match associations safely and role-gates participation updates", () => {
    const source = readFileSync(new URL("./calendar.functions.ts", import.meta.url), "utf8");
    expect(source).toContain("participation_status: DEFAULT_MATCH_PARTICIPATION_STATUS");
    expect(source).toMatch(/updateMatchParticipation[\s\S]*CALENDAR_MANAGE_ROLES/);
    expect(source).toMatch(/\.eq\("event_type", "Match"\)/);
  });

  it("fails closed when the existing event cannot be read before an edit", () => {
    const source = readFileSync(new URL("./calendar.functions.ts", import.meta.url), "utf8");
    const updateSource = source.slice(
      source.indexOf("export const updateCalendarEvent"),
      source.indexOf("export const updateMatchParticipation"),
    );
    const readIndex = updateSource.indexOf("error: beforeError");
    const errorGuardIndex = updateSource.indexOf(
      "if (beforeError) throw new Error(beforeError.message)",
    );
    const missingGuardIndex = updateSource.indexOf(
      'if (!before) throw new Error("That calendar event could not be updated.")',
    );
    const writeIndex = updateSource.indexOf(".update({");

    expect(readIndex).toBeGreaterThan(-1);
    expect(errorGuardIndex).toBeGreaterThan(readIndex);
    expect(missingGuardIndex).toBeGreaterThan(errorGuardIndex);
    expect(writeIndex).toBeGreaterThan(missingGuardIndex);
    expect(updateSource).toContain(
      "before.player_id !== fields.player_id || before.event_type !== fields.event_type",
    );
    expect(updateSource).toContain("participation_status: DEFAULT_MATCH_PARTICIPATION_STATUS");
  });
});
