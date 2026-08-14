import { describe, expect, it } from "vitest";
import { validateEvent } from "@/lib/calendar.functions";

const GK = "11111111-1111-4111-8111-111111111111";
const MENTOR = "22222222-2222-4222-8222-222222222222";

/** A complete event, so each test can omit exactly one thing. */
function valid(overrides: Record<string, unknown> = {}) {
  return {
    title: "Watford v Luton — attending",
    event_type: "Match",
    event_date: "2026-08-14",
    start_time: "15:00",
    player_id: GK,
    assigned_mentor_id: MENTOR,
    ...overrides,
  };
}

describe("calendar event required fields", () => {
  it("accepts a fully specified event", () => {
    expect(validateEvent(valid())).toMatchObject({
      title: "Watford v Luton — attending",
      event_type: "Match",
      event_date: "2026-08-14",
      start_time: "15:00",
      player_id: GK,
      assigned_mentor_id: MENTOR,
    });
  });

  it("accepts each of the three schedulable types and nothing else", () => {
    for (const type of ["Match", "Training Ground Visit", "Coffee Catch-up"]) {
      expect(validateEvent(valid({ event_type: type })).event_type).toBe(type);
    }
    for (const retired of ["Observation", "Mentor Visit", "Meeting", "Follow Up", "Other"]) {
      expect(() => validateEvent(valid({ event_type: retired }))).toThrow(
        /Match, Training Ground/i,
      );
    }
    expect(() => validateEvent(valid({ event_type: "" }))).toThrow(/Match, Training Ground/i);
  });

  it("requires a start time, because the deadline is measured from it", () => {
    expect(() => validateEvent(valid({ start_time: "" }))).toThrow(/start time is required/i);
    expect(() => validateEvent(valid({ start_time: "  " }))).toThrow(/start time is required/i);
    expect(() => validateEvent(valid({ start_time: undefined }))).toThrow(
      /start time is required/i,
    );
    expect(() => validateEvent(valid({ start_time: "4pm" }))).toThrow(/HH:MM/);
  });

  it("requires a goalkeeper", () => {
    expect(() => validateEvent(valid({ player_id: "" }))).toThrow(/goalkeeper/i);
    expect(() => validateEvent(valid({ player_id: undefined }))).toThrow(/goalkeeper/i);
  });

  it("requires the attending mentor", () => {
    expect(() => validateEvent(valid({ assigned_mentor_id: "" }))).toThrow(/mentor/i);
    expect(() => validateEvent(valid({ assigned_mentor_id: undefined }))).toThrow(/mentor/i);
  });

  it("requires a date", () => {
    expect(() => validateEvent(valid({ event_date: "" }))).toThrow(/date/i);
    expect(() => validateEvent(valid({ event_date: "14/08/2026" }))).toThrow(/date/i);
  });

  it("rejects a goalkeeper or mentor that is not a roster/profile id", () => {
    expect(() => validateEvent(valid({ player_id: "James Beadle" }))).toThrow(/roster list/i);
    expect(() => validateEvent(valid({ assigned_mentor_id: "David Rouse" }))).toThrow(
      /from the list/i,
    );
  });
});

describe("calendar event optional fields", () => {
  it("accepts location and notes of any length up to their caps, including empty", () => {
    const blank = validateEvent(valid({ location: "", notes: "" }));
    expect(blank.location).toBeNull();
    expect(blank.notes).toBe("");

    const single = validateEvent(valid({ location: "x", notes: "y" }));
    expect(single.location).toBe("x");
    expect(single.notes).toBe("y");
  });

  it("no longer accepts an end time", () => {
    expect(validateEvent(valid())).not.toHaveProperty("end_time");
  });

  it("still caps title, location and notes", () => {
    expect(() => validateEvent(valid({ title: "t".repeat(161) }))).toThrow(/160/);
    expect(() => validateEvent(valid({ location: "l".repeat(161) }))).toThrow(/160/);
    expect(() => validateEvent(valid({ notes: "n".repeat(4001) }))).toThrow(/4000/);
  });
});
