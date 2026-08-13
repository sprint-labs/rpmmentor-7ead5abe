import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addCalendarDays,
  buildRosterNameIndex,
  formatUpcomingEventDateTime,
  mapPlannedType,
  mapUpcomingCalendarEvents,
  upcomingGroupLabel,
  upcomingWindow,
  type UpcomingCalendarEventRow,
  type UpcomingRosterGoalkeeper,
} from "./mentor-upcoming-events";

const ROSTER: UpcomingRosterGoalkeeper[] = [
  {
    id: "gk-james-beadle",
    name: "James Beadle",
    initials: "JB",
    status: "Tier 2",
    tierLevel: 2,
    club: "Sheffield Wednesday",
    league: "Championship",
  },
  {
    id: "gk-sam-tickle",
    name: "Sam Tickle",
    initials: "ST",
    status: "Free Agent",
    tierLevel: 3,
    club: "",
    league: "",
  },
];

function event(overrides: Partial<UpcomingCalendarEventRow> = {}): UpcomingCalendarEventRow {
  return {
    id: "event-1",
    title: "Sheffield Wednesday v Norwich",
    event_type: "Match",
    event_date: "2026-08-20",
    start_time: "15:00:00",
    goalkeeper_name: "James Beadle",
    ...overrides,
  };
}

describe("mapPlannedType", () => {
  it("keeps the mapping the dashboard filter chips depend on", () => {
    expect(mapPlannedType("Match")).toBe("Attend Live Match");
    expect(mapPlannedType("Observation")).toBe("Attend Live Match");
    expect(mapPlannedType("Mentor Visit")).toBe("Training Ground Visit");
    expect(mapPlannedType("Meeting")).toBe("Coffee Catch Up");
  });

  it("returns null for a type with no in-person equivalent", () => {
    expect(mapPlannedType("Follow Up")).toBeNull();
    expect(mapPlannedType("Other")).toBeNull();
    expect(mapPlannedType("")).toBeNull();
  });
});

describe("goalkeeper decoration", () => {
  it("decorates an event whose goalkeeper is on the roster", () => {
    const [item] = mapUpcomingCalendarEvents([event()], ROSTER);

    expect(item).toMatchObject({
      // The Log button prefills from this slug.
      gkId: "gk-james-beadle",
      gkName: "James Beadle",
      gkInitials: "JB",
      gkStatus: "Tier 2",
      gkTierLevel: 2,
      gkClub: "Sheffield Wednesday",
      gkLeague: "Championship",
      gkFreeAgent: false,
      plannedType: "Attend Live Match",
    });
  });

  it("matches through the shared name normalisation", () => {
    const [item] = mapUpcomingCalendarEvents(
      [event({ goalkeeper_name: "  james   BEADLE " })],
      ROSTER,
    );

    expect(item!.gkId).toBe("gk-james-beadle");
    expect(item!.gkName).toBe("James Beadle");
  });

  it("flags a roster goalkeeper who is a free agent", () => {
    const [item] = mapUpcomingCalendarEvents([event({ goalkeeper_name: "Sam Tickle" })], ROSTER);

    expect(item!.gkFreeAgent).toBe(true);
  });

  it("degrades to the stored name with no badges when the roster has no match", () => {
    const [item] = mapUpcomingCalendarEvents(
      [event({ goalkeeper_name: "Unlisted Keeper" })],
      ROSTER,
    );

    expect(item).toMatchObject({
      gkId: null,
      gkName: "Unlisted Keeper",
      gkInitials: null,
      gkStatus: null,
      gkTierLevel: null,
      gkClub: null,
      gkLeague: null,
      gkFreeAgent: false,
    });
  });

  it("handles an event with no goalkeeper at all", () => {
    const [item] = mapUpcomingCalendarEvents([event({ goalkeeper_name: null })], ROSTER);

    expect(item!.gkId).toBeNull();
    expect(item!.gkName).toBeNull();
  });

  it("keeps the stored date, title and type intact", () => {
    const [item] = mapUpcomingCalendarEvents([event()], ROSTER);

    expect(item!.id).toBe("event-1");
    expect(item!.date).toBe("2026-08-20");
    expect(item!.title).toBe("Sheffield Wednesday v Norwich");
    expect(item!.type).toBe("Match");
  });

  it("indexes the roster by normalised name", () => {
    const index = buildRosterNameIndex(ROSTER);

    expect(index.get("james beadle")?.id).toBe("gk-james-beadle");
    expect(index.get("James Beadle")).toBeUndefined();
  });
});

describe("start time", () => {
  it("trims a stored TIME down to HH:MM", () => {
    const [item] = mapUpcomingCalendarEvents([event({ start_time: "15:00:00" })], ROSTER);

    expect(item!.startTime).toBe("15:00");
    expect(formatUpcomingEventDateTime(item!.date, item!.startTime)).toBe("August 20th · 15:00");
  });

  it("renders the date alone rather than a misleading 00:00 when there is no time", () => {
    const [item] = mapUpcomingCalendarEvents([event({ start_time: null })], ROSTER);

    expect(item!.startTime).toBeNull();
    const rendered = formatUpcomingEventDateTime(item!.date, item!.startTime);
    expect(rendered).toBe("August 20th");
    expect(rendered).not.toContain("00:00");
  });

  it("treats an empty or malformed stored time as no time", () => {
    expect(mapUpcomingCalendarEvents([event({ start_time: "" })], ROSTER)[0]!.startTime).toBeNull();
    expect(
      mapUpcomingCalendarEvents([event({ start_time: "not a time" })], ROSTER)[0]!.startTime,
    ).toBeNull();
  });
});

describe("local calendar dates", () => {
  const originalTz = process.env.TZ;

  // Anywhere west of UTC is where `new Date("2026-08-20")` — UTC midnight —
  // silently becomes the previous day. Pin the zone so these assertions fail
  // if that round-trip is ever reintroduced, whatever the machine's own zone.
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });

  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("confirms the anti-pattern this guards against really does shift the day", () => {
    expect(new Date("2026-08-20").getDate()).toBe(19);
  });

  it("formats the stored day, not the UTC-parsed one", () => {
    expect(formatUpcomingEventDateTime("2026-08-20", "15:00:00")).toBe("August 20th · 15:00");
    expect(formatUpcomingEventDateTime("2026-08-01", null)).toBe("August 1st");
    expect(formatUpcomingEventDateTime("2026-08-02", null)).toBe("August 2nd");
    expect(formatUpcomingEventDateTime("2026-08-03", null)).toBe("August 3rd");
    expect(formatUpcomingEventDateTime("2026-08-11", null)).toBe("August 11th");
  });

  it("returns the raw value for a date it cannot parse", () => {
    expect(formatUpcomingEventDateTime("", null)).toBe("");
    expect(formatUpcomingEventDateTime("not-a-date", null)).toBe("not-a-date");
  });

  it("adds days as calendar days, across month and year ends", () => {
    expect(addCalendarDays("2026-08-20", 14)).toBe("2026-09-03");
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2026-08-20", 0)).toBe("2026-08-20");
  });

  it("survives the DST changes, where a day is 23 or 25 hours", () => {
    // In this zone 1 November 2026 is 25 hours long, so a `+ 86400000`
    // shortcut stays on 1 November instead of reaching 2 November.
    expect(addCalendarDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addCalendarDays("2026-11-01", 14)).toBe("2026-11-15");
    // 8 March 2026 is only 23 hours long.
    expect(addCalendarDays("2026-03-08", 1)).toBe("2026-03-09");
  });

  it("builds the forward window from the caller's local today", () => {
    expect(upcomingWindow("2026-08-13", 14)).toEqual({
      fromDate: "2026-08-13",
      toDate: "2026-08-27",
    });
    expect(upcomingWindow("2026-08-13", 7).toDate).toBe("2026-08-20");
    expect(upcomingWindow("2026-08-13", 30).toDate).toBe("2026-09-12");
  });

  it("groups a stored date against the viewer's local today", () => {
    // Thursday 13 August 2026, mid-afternoon local time.
    const now = new Date(2026, 7, 13, 15, 30);

    expect(upcomingGroupLabel("2026-08-13", now)).toBe("Today");
    expect(upcomingGroupLabel("2026-08-14", now)).toBe("Tomorrow");
    // Still the Monday-start week containing 13 August.
    expect(upcomingGroupLabel("2026-08-16", now)).toBe("This week");
    expect(upcomingGroupLabel("2026-08-17", now)).toBe("Next week");
    expect(upcomingGroupLabel("2026-08-23", now)).toBe("Next week");
    expect(upcomingGroupLabel("2026-08-24", now)).toBe("Later");
  });

  it("groups the last hour of the day the same as the first", () => {
    const earlyMorning = new Date(2026, 7, 13, 0, 5);
    const lateEvening = new Date(2026, 7, 13, 23, 55);

    expect(upcomingGroupLabel("2026-08-13", earlyMorning)).toBe("Today");
    expect(upcomingGroupLabel("2026-08-13", lateEvening)).toBe("Today");
    expect(upcomingGroupLabel("2026-08-14", lateEvening)).toBe("Tomorrow");
  });

  it("groups across a spring-forward without losing a day", () => {
    // 8 March 2026 is only 23 hours long in this zone, so a truncating day
    // difference would call the 9th "Today".
    const springForward = new Date(2026, 2, 8, 12, 0);

    expect(upcomingGroupLabel("2026-03-08", springForward)).toBe("Today");
    expect(upcomingGroupLabel("2026-03-09", springForward)).toBe("Tomorrow");
  });
});
