import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isCalendarEventType,
  toTeamCalendarEvent,
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
    location: "Northbridge",
    notes: "",
    player_id: PLAYER,
    goalkeeper_name: "Alex Testkeeper",
    assigned_mentor_id: MENTOR,
    assigned_mentor_name: "Morgan Mentor",
    created_by: CREATOR,
    created_by_name: "Riley Manager",
    ...overrides,
  };
}

describe("isCalendarEventType", () => {
  it("accepts the stored event types and rejects anything else", () => {
    expect(isCalendarEventType("Match")).toBe(true);
    expect(isCalendarEventType("Observation")).toBe(true);
    expect(isCalendarEventType("Other")).toBe(true);
    expect(isCalendarEventType("")).toBe(false);
    expect(isCalendarEventType("Attend Live Match")).toBe(false);
  });
});

describe("toTeamCalendarEvent", () => {
  it("keeps the assigned mentor id and name from the generated row type", () => {
    expect(toTeamCalendarEvent(row())).toMatchObject({
      event_type: "Match",
      player_id: PLAYER,
      goalkeeper_name: "Alex Testkeeper",
      assigned_mentor_id: MENTOR,
      assigned_mentor_name: "Morgan Mentor",
    });
  });

  it("allows a null assignee for events scheduled before mentors were assignable", () => {
    expect(
      toTeamCalendarEvent(row({ assigned_mentor_id: null, assigned_mentor_name: "" })),
    ).toMatchObject({
      assigned_mentor_id: null,
      assigned_mentor_name: "",
    });
  });

  it("rejects a free-text event_type instead of asserting it", () => {
    expect(() => toTeamCalendarEvent(row({ event_type: "Training Ground Visit" }))).toThrow(
      /Unknown event type/,
    );
  });
});

describe("calendar event query columns", () => {
  it("selects assigned_mentor_id and assigned_mentor_name without casting the result", () => {
    const source = readFileSync(new URL("./calendar.functions.ts", import.meta.url), "utf8");
    expect(source).toMatch(/assigned_mentor_id, assigned_mentor_name/);
    expect(source).not.toMatch(/as TeamCalendarEvent/);
    expect(source).not.toMatch(/as TeamCalendarEvent\[\]/);
  });
});
