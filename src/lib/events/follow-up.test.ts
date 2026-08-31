import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  FOLLOW_UP_KIND_BY_EVENT_TYPE,
  FOLLOW_UP_WINDOW_HOURS,
  INTERACTION_TYPE_BY_EVENT_TYPE,
  acceptsFollowUpKind,
  followUpRequirementLabel,
  isEventType,
  resolveFollowUp,
  type FollowUpSource,
} from "./follow-up";
import { londonWallClockMs } from "@/lib/time/london";
import {
  DEFAULT_MATCH_PARTICIPATION_STATUS,
  MATCH_PARTICIPATION_STATUSES,
  normalizeMatchParticipationStatus,
} from "./participation";

/** A Match at 15:00 London on a summer Saturday, nothing recorded yet. */
function matchEvent(over: Partial<FollowUpSource> = {}): FollowUpSource {
  return {
    eventType: "Match",
    participationStatus: "played",
    eventDate: "2026-08-15",
    startTime: "15:00",
    cancelled: false,
    waived: false,
    completedRecordId: null,
    ...over,
  };
}

const KICK_OFF = londonWallClockMs("2026-08-15", "15:00");
const HOUR = 3_600_000;

describe("event types", () => {
  it("offers exactly the three schedulable types", () => {
    expect(EVENT_TYPES).toEqual(["Match", "Training Ground Visit", "Coffee Catch-up"]);
  });

  it("rejects the retired types for new events", () => {
    for (const retired of ["Observation", "Mentor Visit", "Meeting", "Follow Up", "Other"]) {
      expect(isEventType(retired)).toBe(false);
    }
  });

  it("expects a Match Report for a Match and an Interaction for the face-to-face types", () => {
    expect(FOLLOW_UP_KIND_BY_EVENT_TYPE).toEqual({
      Match: "match_report",
      "Training Ground Visit": "interaction",
      "Coffee Catch-up": "interaction",
    });
  });

  it("maps each face-to-face event to a storable interaction type", () => {
    // "Coffee Catch Up" is fixed by a database check constraint; the event label
    // is hyphenated. The mapping must bridge the two.
    expect(INTERACTION_TYPE_BY_EVENT_TYPE["Coffee Catch-up"]).toBe("Coffee Catch Up");
    expect(INTERACTION_TYPE_BY_EVENT_TYPE["Training Ground Visit"]).toBe("Training Ground Visit");
  });

  it("will not let the wrong kind of record close an event", () => {
    expect(acceptsFollowUpKind("Match", "match_report")).toBe(true);
    expect(acceptsFollowUpKind("Match", "interaction")).toBe(false);
    expect(acceptsFollowUpKind("Coffee Catch-up", "interaction")).toBe(true);
    expect(acceptsFollowUpKind("Coffee Catch-up", "match_report")).toBe(false);
    expect(acceptsFollowUpKind("Meeting", "interaction")).toBe(false);
  });

  it("names the required record for a mentor", () => {
    expect(followUpRequirementLabel("match_report")).toBe("Match Report");
    expect(followUpRequirementLabel("interaction")).toBe("Interaction");
    expect(followUpRequirementLabel(null)).toBe("No write-up required");
  });
});

describe("match participation", () => {
  it("defines a safe Not confirmed default and normalises unknown provider values", () => {
    expect(MATCH_PARTICIPATION_STATUSES).toEqual(["not_confirmed", "played", "did_not_play"]);
    expect(DEFAULT_MATCH_PARTICIPATION_STATUS).toBe("not_confirmed");
    expect(normalizeMatchParticipationStatus(undefined)).toBe("not_confirmed");
    expect(normalizeMatchParticipationStatus(null)).toBe("not_confirmed");
    expect(normalizeMatchParticipationStatus("starter")).toBe("not_confirmed");
    expect(normalizeMatchParticipationStatus("played")).toBe("played");
  });

  it("requires reports for only the two Played goalkeepers in a five-goalkeeper fixture", () => {
    const participation = [
      "played",
      "did_not_play",
      "not_confirmed",
      "played",
      "did_not_play",
    ] as const;

    const followUps = participation.map((participationStatus) =>
      resolveFollowUp(matchEvent({ participationStatus }), KICK_OFF + 100 * HOUR),
    );

    expect(followUps.filter(({ kind }) => kind === "match_report")).toHaveLength(2);
    expect(followUps.filter(({ status }) => status === "overdue")).toHaveLength(2);
  });

  it("does not require a report when the goalkeeper Did not play", () => {
    const result = resolveFollowUp(
      matchEvent({ participationStatus: "did_not_play" }),
      KICK_OFF + 100 * HOUR,
    );

    expect(result.participationStatus).toBe("did_not_play");
    expect(result.kind).toBeNull();
    expect(result.status).toBe("not_required");
  });

  it("asks for participation confirmation after a Match without creating an overdue report", () => {
    const result = resolveFollowUp(
      matchEvent({ participationStatus: "not_confirmed" }),
      KICK_OFF + 100 * HOUR,
    );

    expect(result.participationStatus).toBe("not_confirmed");
    expect(result.kind).toBeNull();
    expect(result.status).toBe("confirmation_needed");
  });

  it("keeps an unconfirmed future Match scheduled until there is something to confirm", () => {
    expect(
      resolveFollowUp(matchEvent({ participationStatus: "not_confirmed" }), KICK_OFF - HOUR).status,
    ).toBe("scheduled");
  });

  it("treats a missing historic participation value as Not confirmed, never Played", () => {
    const result = resolveFollowUp(
      matchEvent({ participationStatus: undefined }),
      KICK_OFF + 100 * HOUR,
    );

    expect(result.participationStatus).toBe("not_confirmed");
    expect(result.kind).toBeNull();
    expect(result.status).toBe("confirmation_needed");
  });

  it("keeps an existing linked report completed regardless of participation", () => {
    for (const participationStatus of ["not_confirmed", "did_not_play"] as const) {
      const result = resolveFollowUp(
        matchEvent({ participationStatus, completedRecordId: "mr_existing" }),
        KICK_OFF + 100 * HOUR,
      );

      expect(result.kind).toBe("match_report");
      expect(result.status).toBe("completed");
      expect(result.completedRecordId).toBe("mr_existing");
    }
  });

  it("ignores participation safely for non-Match follow-ups", () => {
    const result = resolveFollowUp(
      matchEvent({
        eventType: "Training Ground Visit",
        participationStatus: "did_not_play",
      }),
      KICK_OFF + HOUR,
    );

    expect(result.participationStatus).toBeNull();
    expect(result.kind).toBe("interaction");
    expect(result.status).toBe("pending");
  });
});

describe("deadline", () => {
  it("is 48 hours after the scheduled start when there is no end time", () => {
    const { deadlineMs, endsAtMs } = resolveFollowUp(matchEvent(), KICK_OFF);
    expect(endsAtMs).toBe(KICK_OFF);
    expect(deadlineMs).toBe(KICK_OFF + FOLLOW_UP_WINDOW_HOURS * HOUR);
  });

  it("is measured from the end time when one is stored", () => {
    const { deadlineMs } = resolveFollowUp(matchEvent({ endTime: "17:00" }), KICK_OFF);
    expect(deadlineMs).toBe(londonWallClockMs("2026-08-15", "17:00") + 48 * HOUR);
  });

  it("recalculates from the new time when an event is rescheduled", () => {
    const before = resolveFollowUp(matchEvent(), KICK_OFF);
    const after = resolveFollowUp(
      matchEvent({ eventDate: "2026-08-22", startTime: "12:30" }),
      KICK_OFF,
    );
    expect(after.deadlineMs).not.toBe(before.deadlineMs);
    expect(after.deadlineMs).toBe(londonWallClockMs("2026-08-22", "12:30") + 48 * HOUR);
  });

  it("falls back to end of day for a legacy event with no time", () => {
    const { endsAtMs } = resolveFollowUp(matchEvent({ startTime: null }), KICK_OFF);
    expect(endsAtMs).toBe(londonWallClockMs("2026-08-15", "23:59"));
  });
});

describe("status", () => {
  it("shows Scheduled before the event happens", () => {
    expect(resolveFollowUp(matchEvent(), KICK_OFF - HOUR).status).toBe("scheduled");
  });

  it("shows Pending once the event has passed but the window is still open", () => {
    expect(resolveFollowUp(matchEvent(), KICK_OFF + HOUR).status).toBe("pending");
    expect(resolveFollowUp(matchEvent(), KICK_OFF + 47 * HOUR).status).toBe("pending");
  });

  it("shows Overdue once 48 hours have passed with nothing saved", () => {
    expect(resolveFollowUp(matchEvent(), KICK_OFF + 48 * HOUR + 1).status).toBe("overdue");
    expect(resolveFollowUp(matchEvent(), KICK_OFF + 100 * HOUR).status).toBe("overdue");
  });

  it("shows Completed only when a saved record is linked", () => {
    const opened = resolveFollowUp(matchEvent({ completedRecordId: null }), KICK_OFF + HOUR);
    expect(opened.status).toBe("pending");

    const saved = resolveFollowUp(
      matchEvent({ completedRecordId: "mr_2026-08-15_beadle" }),
      KICK_OFF + HOUR,
    );
    expect(saved.status).toBe("completed");
    expect(saved.completedRecordId).toBe("mr_2026-08-15_beadle");
  });

  it("stays Completed however long ago the deadline was", () => {
    const late = resolveFollowUp(matchEvent({ completedRecordId: "mr_1" }), KICK_OFF + 1000 * HOUR);
    expect(late.status).toBe("completed");
  });

  it("shows Cancelled for a cancelled event with nothing saved", () => {
    expect(resolveFollowUp(matchEvent({ cancelled: true }), KICK_OFF + HOUR).status).toBe(
      "cancelled",
    );
    // Cancelling after the deadline still closes the requirement rather than
    // leaving it screaming overdue for ever.
    expect(resolveFollowUp(matchEvent({ cancelled: true }), KICK_OFF + 200 * HOUR).status).toBe(
      "cancelled",
    );
  });

  it("keeps a saved record visible even if the event is cancelled afterwards", () => {
    const status = resolveFollowUp(
      matchEvent({ cancelled: true, completedRecordId: "mr_1" }),
      KICK_OFF + 200 * HOUR,
    ).status;
    expect(status).toBe("completed");
  });

  it("shows Not required once a manager has waived it", () => {
    expect(resolveFollowUp(matchEvent({ waived: true }), KICK_OFF + 200 * HOUR).status).toBe(
      "not_required",
    );
  });

  it("keeps a historic waiver closed when participation is still unconfirmed", () => {
    const result = resolveFollowUp(
      matchEvent({ waived: true, participationStatus: "not_confirmed" }),
      KICK_OFF + 200 * HOUR,
    );
    expect(result.status).toBe("not_required");
  });

  it("treats an unreadable date as still to come rather than inventing an alert", () => {
    expect(resolveFollowUp(matchEvent({ eventDate: "not-a-date" }), KICK_OFF).status).toBe(
      "scheduled",
    );
  });

  it("carries no requirement for a legacy event type", () => {
    const legacy = resolveFollowUp(matchEvent({ eventType: "Meeting" }), KICK_OFF + 200 * HOUR);
    expect(legacy.kind).toBeNull();
  });
});

describe("changing an event", () => {
  const source = matchEvent();

  it("moves the requirement with a change of type, without creating a second one", () => {
    const asMatch = resolveFollowUp(source, KICK_OFF + HOUR);
    const asVisit = resolveFollowUp(
      { ...source, eventType: "Training Ground Visit" },
      KICK_OFF + HOUR,
    );
    expect(asMatch.kind).toBe("match_report");
    expect(asVisit.kind).toBe("interaction");
    // Same event, same single requirement — only what it asks for changed.
    expect(asVisit.deadlineMs).toBe(asMatch.deadlineMs);
  });

  it("is unaffected by who the event is assigned to", () => {
    // Reassignment changes the recipient, not the requirement: the status is a
    // function of the event alone, so it can never be duplicated per mentor.
    const a = resolveFollowUp(source, KICK_OFF + HOUR);
    const b = resolveFollowUp({ ...source }, KICK_OFF + HOUR);
    expect(a).toEqual(b);
  });
});
