import { describe, expect, it } from "vitest";

import { eventSummaryLine } from "./event-summary";

describe("eventSummaryLine", () => {
  it("carries kick-off, goalkeeper and mentor for a fixture", () => {
    expect(
      eventSummaryLine({
        type: "Match",
        startTimeLabel: "15:00",
        location: "Lamex Stadium",
        goalkeeperName: "Joe Lumley",
        mentorAttendingName: "Ben Beson",
      }),
    ).toBe("15:00 · Joe Lumley · Ben Beson attending");
  });

  it("drops a match's location, which its title already names", () => {
    expect(
      eventSummaryLine({ type: "Match", location: "Lamex Stadium", goalkeeperName: "Joe Lumley" }),
    ).toBe("Joe Lumley");
  });

  it("keeps the location for anything that is not a fixture", () => {
    expect(
      eventSummaryLine({
        type: "Training ground visit",
        startTimeLabel: "10:30",
        location: "Cobham",
        goalkeeperName: "Toby Bell",
      }),
    ).toBe("10:30 · Cobham · Toby Bell");
  });

  it("never names whoever added the row", () => {
    const line = eventSummaryLine({
      type: "Match",
      startTimeLabel: "15:00",
      goalkeeperName: "Joe Lumley",
      mentorAttendingName: "Ben Beson",
    });

    expect(line).not.toMatch(/added by/i);
  });

  it("omits what an event does not have rather than printing empty separators", () => {
    expect(eventSummaryLine({ type: "Match" })).toBe("");
    expect(eventSummaryLine({ type: "Match", goalkeeperName: "Joe Lumley" })).toBe("Joe Lumley");
  });
});
