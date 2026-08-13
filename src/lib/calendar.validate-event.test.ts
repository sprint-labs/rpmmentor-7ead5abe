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
      player_id: GK,
      assigned_mentor_id: MENTOR,
    });
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
  it("treats start time as optional and keeps a supplied one", () => {
    expect(validateEvent(valid()).start_time).toBeNull();
    expect(validateEvent(valid({ start_time: "16:00" })).start_time).toBe("16:00");
    expect(validateEvent(valid({ start_time: "  " })).start_time).toBeNull();
  });

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
