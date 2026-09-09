import { describe, expect, it } from "vitest";
import {
  buildEventNotification,
  cancellationFeedback,
  followUpLinkPath,
  formatEventWhen,
  type NotifiableEvent,
} from "./notification-copy";

const matchEvent: NotifiableEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Birmingham vs Bolton",
  eventType: "Match",
  eventDate: "2026-08-15",
  startTime: "15:00",
  goalkeeperName: "James Beadle",
  playerId: "22222222-2222-4222-8222-222222222222",
  participationStatus: "played",
};

const coffeeEvent: NotifiableEvent = {
  ...matchEvent,
  eventType: "Coffee Catch-up",
  title: "Catch-up",
};

describe("formatEventWhen", () => {
  it("shows the London wall-clock time regardless of the reader's timezone", () => {
    expect(formatEventWhen(matchEvent)).toContain("15:00");
    expect(formatEventWhen(matchEvent)).toContain("Aug");
  });
});

describe("followUpLinkPath", () => {
  it("opens the Match Report form, carrying the event id for linking", () => {
    const path = followUpLinkPath(matchEvent, "match_report");
    expect(path.startsWith("/reports?")).toBe(true);
    const params = new URLSearchParams(path.split("?")[1]);
    expect(params.get("openSubmit")).toBe("1");
    expect(params.get("gk")).toBe("James Beadle");
    expect(params.get("matchDate")).toBe("2026-08-15");
    expect(params.get("eventId")).toBe(matchEvent.id);
  });

  it("opens the Log Interaction form by player id", () => {
    const path = followUpLinkPath(coffeeEvent, "interaction");
    expect(path.startsWith("/interactions?")).toBe(true);
    const params = new URLSearchParams(path.split("?")[1]);
    expect(params.get("openLog")).toBe("1");
    expect(params.get("gkId")).toBe(coffeeEvent.playerId);
    expect(params.get("eventId")).toBe(coffeeEvent.id);
  });

  it("falls back to the calendar when nothing is required", () => {
    expect(followUpLinkPath(matchEvent, null)).toBe("/calendar");
  });
});

describe("buildEventNotification", () => {
  const now = Date.parse("2026-08-10T09:00:00Z");

  it("tells a newly assigned mentor everything needed to act", () => {
    const n = buildEventNotification("event_assigned", matchEvent, { now });
    expect(n.title).toContain("Match");
    expect(n.title).toContain("James Beadle");
    // Every one of the six required facts.
    expect(n.body).toContain("Match");
    expect(n.body).toContain("James Beadle");
    expect(n.body).toContain("15:00");
    expect(n.body).toContain("Match Report");
    expect(n.body).toContain("Due by:");
    expect(n.linkPath).toContain("eventId=");
  });

  it("asks for an Interaction after a coffee catch-up, not a Match Report", () => {
    const n = buildEventNotification("event_assigned", coffeeEvent, { now });
    expect(n.body).toContain("You need to submit: Interaction");
    expect(n.body).not.toContain("Match Report");
    expect(n.linkPath).toContain("/interactions");
  });

  it("assigns participation confirmation to calendar management, not the attending mentor", () => {
    const n = buildEventNotification(
      "event_assigned",
      { ...matchEvent, participationStatus: "not_confirmed" },
      { now },
    );
    expect(n.body).toContain("a Mentor Manager or administrator needs to confirm who played");
    expect(n.body).toContain("no Match Report is due unless this goalkeeper is marked Played");
    expect(n.body).not.toContain("Action: confirm");
    expect(n.body).not.toContain("You need to submit: Match Report");
    expect(n.body).not.toContain("Due by:");
    expect(n.linkPath).toBe("/calendar");
  });

  it("states that no Match Report is required when the goalkeeper did not play", () => {
    const n = buildEventNotification(
      "event_updated",
      { ...matchEvent, participationStatus: "did_not_play" },
      { now },
    );
    expect(n.body).toContain("Did not play");
    expect(n.body).toContain("no Match Report is required");
    expect(n.body).not.toContain("Due by:");
    expect(n.linkPath).toBe("/calendar");
  });

  it("links to an existing report instead of asking for another submission", () => {
    const n = buildEventNotification("event_updated", matchEvent, {
      now,
      completedRecordId: "report-1",
    });

    expect(n.body).toContain("Match Report: already submitted");
    expect(n.body).not.toContain("You need to submit");
    expect(n.body).not.toContain("Due by:");
    expect(n.linkPath).toBe("/reports/report-1");
  });

  it.each(["not_confirmed", "did_not_play"] as const)(
    "keeps an existing report visible when participation is %s",
    (participationStatus) => {
      const n = buildEventNotification(
        "event_updated",
        { ...matchEvent, participationStatus },
        { now, completedRecordId: "report-1" },
      );

      expect(n.body).toContain("Match Report: already submitted");
      expect(n.body).not.toContain("You need to submit");
      expect(n.linkPath).toBe("/reports/report-1");
    },
  );

  it("states the deadline as 48 hours after the scheduled time", () => {
    const n = buildEventNotification("event_assigned", matchEvent, { now });
    // 15:00 on the 15th, plus 48 hours, is 15:00 on the 17th London time.
    expect(n.body).toContain("17 Aug, 15:00");
  });

  it("explains a reassignment to the mentor losing it, with no work to do", () => {
    const n = buildEventNotification("event_unassigned", matchEvent, { now });
    expect(n.body).toContain("no longer expected");
    expect(n.body).not.toContain("Due by:");
    expect(n.linkPath).toBe("/calendar");
  });

  it("passes on the reason when an event is cancelled", () => {
    const n = buildEventNotification("event_cancelled", matchEvent, {
      now,
      reason: "Fixture postponed",
    });
    expect(n.title).toContain("Cancelled");
    expect(n.body).toContain("Reason: Fixture postponed");
    expect(n.body).not.toContain("Due by:");
  });

  it("omits the reason line when none was given", () => {
    const n = buildEventNotification("event_cancelled", matchEvent, { now });
    expect(n.body).not.toContain("Reason:");
  });

  it("frames an overdue write-up as duty of care, not safeguarding", () => {
    const n = buildEventNotification("follow_up_overdue", matchEvent, {
      now: Date.parse("2026-08-20T09:00:00Z"),
    });
    expect(n.title).toContain("Overdue");
    expect(n.body).toContain("duty-of-care");
    expect(n.body).toContain("not a safeguarding concern");
    expect(n.linkPath).toContain("openSubmit=1");
  });

  it("copes with an event whose goalkeeper name is missing", () => {
    const n = buildEventNotification(
      "event_assigned",
      { ...matchEvent, goalkeeperName: null },
      { now },
    );
    expect(n.title).toContain("an unnamed goalkeeper");
  });
});

describe("cancellationFeedback", () => {
  it("only claims the mentor was notified when delivery succeeded", () => {
    expect(cancellationFeedback("delivered")).toEqual({
      level: "success",
      message: "Event cancelled. The assigned mentor has been notified.",
    });
    expect(cancellationFeedback("not_required")).toEqual({
      level: "success",
      message: "Event cancelled.",
    });
    expect(cancellationFeedback("failed")).toEqual({
      level: "warning",
      message:
        "Event cancelled, but the mentor notification could not be delivered. Contact them directly.",
    });
  });
});
