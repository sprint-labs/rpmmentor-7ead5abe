import { describe, expect, it } from "vitest";
import {
  assertMatchReportMatchesEvent,
  DUPLICATE_FOLLOW_UP_MESSAGE,
  isDuplicateFollowUp,
  verifyFollowUpTarget,
} from "./link-follow-up.server";

const MENTOR = "11111111-1111-4111-8111-111111111111";
const OTHER_MENTOR = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const EVENT = "44444444-4444-4444-8444-444444444444";
const PLAYER = "55555555-5555-4555-8555-555555555555";

interface EventShape {
  id: string;
  event_type: string;
  event_date: string;
  status: string;
  participation_status: string;
  player_id: string | null;
  goalkeeper_name: string | null;
  assigned_mentor_id: string | null;
}

/**
 * The only two reads `verifyFollowUpTarget` makes: the event, and the caller's
 * roles. Deliberately minimal — this tests the decision, not PostgREST.
 */
function fakeDb(
  event: EventShape | null,
  roles: Record<string, string[]> = {},
  existingReport = false,
) {
  return {
    from(table: string) {
      if (table === "calendar_events") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: event, error: null }) }),
          }),
        };
      }
      if (table === "match_reports_cache") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: existingReport ? { report_id: "historic-report" } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      // getUserRoles awaits the builder, so `eq` resolves to the result directly.
      return {
        select: () => ({
          eq: (_column: string, userId: string) =>
            Promise.resolve({
              data: (roles[userId] ?? []).map((role) => ({ role })),
              error: null,
            }),
        }),
      };
    },
  };
}

const matchEvent: EventShape = {
  id: EVENT,
  event_type: "Match",
  event_date: "2026-08-15",
  status: "scheduled",
  participation_status: "played",
  player_id: PLAYER,
  goalkeeper_name: "James Beadle",
  assigned_mentor_id: MENTOR,
};

describe("verifyFollowUpTarget", () => {
  it("accepts the assigned mentor writing up their own Match", async () => {
    const target = await verifyFollowUpTarget(
      fakeDb(matchEvent) as never,
      MENTOR,
      EVENT,
      "match_report",
    );
    expect(target).toEqual({
      eventId: EVENT,
      playerId: PLAYER,
      goalkeeperName: "James Beadle",
      eventDate: "2026-08-15",
      assignedMentorId: MENTOR,
      existingReportId: null,
      interactionType: null,
    });
  });

  it.each([
    ["Training Ground Visit", "Training Ground Visit"],
    ["Coffee Catch-up", "Coffee Catch Up"],
  ])("returns the required interaction type for a %s", async (eventType, interactionType) => {
    const target = await verifyFollowUpTarget(
      fakeDb({ ...matchEvent, event_type: eventType }) as never,
      MENTOR,
      EVENT,
      "interaction",
    );
    expect(target.interactionType).toBe(interactionType);
  });

  it("refuses a Match Report for an event that expects an interaction", async () => {
    await expect(
      verifyFollowUpTarget(
        fakeDb({ ...matchEvent, event_type: "Coffee Catch-up" }) as never,
        MENTOR,
        EVENT,
        "match_report",
      ),
    ).rejects.toThrow(/written up with an interaction/i);
  });

  it("refuses an interaction for a Match", async () => {
    await expect(
      verifyFollowUpTarget(fakeDb(matchEvent) as never, MENTOR, EVENT, "interaction"),
    ).rejects.toThrow(/written up with a Match Report/i);
  });

  it("refuses a Match Report until participation is confirmed as Played", async () => {
    await expect(
      verifyFollowUpTarget(
        fakeDb({ ...matchEvent, participation_status: "not_confirmed" }) as never,
        MENTOR,
        EVENT,
        "match_report",
      ),
    ).rejects.toThrow(/Confirm.*Played/i);
  });

  it("refuses a Match Report when the goalkeeper did not play", async () => {
    await expect(
      verifyFollowUpTarget(
        fakeDb({ ...matchEvent, participation_status: "did_not_play" }) as never,
        MENTOR,
        EVENT,
        "match_report",
      ),
    ).rejects.toThrow(/Did not play/i);
  });

  it.each(["not_confirmed", "did_not_play"])(
    "keeps an existing linked report retryable when participation is %s",
    async (participationStatus) => {
      const target = await verifyFollowUpTarget(
        fakeDb({ ...matchEvent, participation_status: participationStatus }, {}, true) as never,
        MENTOR,
        EVENT,
        "match_report",
      );
      expect(target.eventId).toBe(EVENT);
      expect(target.existingReportId).toBe("historic-report");
    },
  );

  it("returns an existing linked report even when participation is Played", async () => {
    const target = await verifyFollowUpTarget(
      fakeDb(matchEvent, {}, true) as never,
      MENTOR,
      EVENT,
      "match_report",
    );
    expect(target.existingReportId).toBe("historic-report");
  });

  it("refuses a retired event type outright", async () => {
    await expect(
      verifyFollowUpTarget(
        fakeDb({ ...matchEvent, event_type: "Meeting" }) as never,
        MENTOR,
        EVENT,
        "interaction",
      ),
    ).rejects.toThrow(/Meeting/i);
  });

  it("refuses a cancelled event", async () => {
    await expect(
      verifyFollowUpTarget(
        fakeDb({ ...matchEvent, status: "cancelled" }) as never,
        MENTOR,
        EVENT,
        "match_report",
      ),
    ).rejects.toThrow(/cancelled/i);
  });

  it("refuses an event that no longer exists", async () => {
    await expect(
      verifyFollowUpTarget(fakeDb(null) as never, MENTOR, EVENT, "match_report"),
    ).rejects.toThrow(/no longer exists/i);
  });

  it("refuses another mentor's event", async () => {
    await expect(
      verifyFollowUpTarget(
        fakeDb(matchEvent, { [OTHER_MENTOR]: ["mentor"] }) as never,
        OTHER_MENTOR,
        EVENT,
        "match_report",
      ),
    ).rejects.toThrow(/assigned to another mentor/i);
  });

  it("lets a mentor manager write up somebody else's event", async () => {
    const target = await verifyFollowUpTarget(
      fakeDb(matchEvent, { [MANAGER]: ["mentor_manager"] }) as never,
      MANAGER,
      EVENT,
      "match_report",
    );
    expect(target.eventId).toBe(EVENT);
  });

  it("takes the goalkeeper from the event, not from the caller", async () => {
    const target = await verifyFollowUpTarget(
      fakeDb({ ...matchEvent, goalkeeper_name: "Someone Else" }) as never,
      MENTOR,
      EVENT,
      "match_report",
    );
    expect(target.playerId).toBe(PLAYER);
    expect(target.goalkeeperName).toBe("Someone Else");
  });
});

describe("assertMatchReportMatchesEvent", () => {
  const target = {
    eventId: EVENT,
    playerId: PLAYER,
    goalkeeperName: "James Beadle",
    eventDate: "2026-08-15",
    assignedMentorId: MENTOR,
    existingReportId: null,
    interactionType: null,
  };

  it("accepts the canonical goalkeeper and event date with harmless name formatting", () => {
    expect(() =>
      assertMatchReportMatchesEvent(target, {
        goalkeeperName: "  james   BEADLE ",
        matchDate: "2026-08-15",
      }),
    ).not.toThrow();
  });

  it("refuses a report for another goalkeeper", () => {
    expect(() =>
      assertMatchReportMatchesEvent(target, {
        goalkeeperName: "Another Goalkeeper",
        matchDate: "2026-08-15",
      }),
    ).toThrow(/event is for James Beadle/i);
  });

  it("refuses a report for another fixture date", () => {
    expect(() =>
      assertMatchReportMatchesEvent(target, {
        goalkeeperName: "James Beadle",
        matchDate: "2026-08-16",
      }),
    ).toThrow(/event is dated 2026-08-15/i);
  });

  it("refuses self-healing when the event was moved to another goalkeeper after the report", () => {
    expect(() =>
      assertMatchReportMatchesEvent(
        { ...target, goalkeeperName: "Current Event Goalkeeper" },
        { goalkeeperName: "Saved Report Goalkeeper", matchDate: "2026-08-15" },
      ),
    ).toThrow(/event is for Current Event Goalkeeper/i);
  });

  it("refuses self-healing when the event date changed after the report", () => {
    expect(() =>
      assertMatchReportMatchesEvent(
        { ...target, eventDate: "2026-08-20" },
        { goalkeeperName: "James Beadle", matchDate: "2026-08-15" },
      ),
    ).toThrow(/event is dated 2026-08-20/i);
  });

  it("refuses a first linked report when the event has no canonical player", () => {
    expect(() =>
      assertMatchReportMatchesEvent(
        { ...target, playerId: null },
        { goalkeeperName: "James Beadle", matchDate: "2026-08-15" },
      ),
    ).toThrow(/no canonical goalkeeper/i);
  });
});

describe("duplicate detection", () => {
  it("recognises the unique violation that means already written up", () => {
    expect(isDuplicateFollowUp({ code: "23505" })).toBe(true);
    expect(isDuplicateFollowUp({ code: "23503" })).toBe(false);
    expect(isDuplicateFollowUp(null)).toBe(false);
    expect(isDuplicateFollowUp(undefined)).toBe(false);
  });

  it("explains the clash in terms a mentor can act on", () => {
    expect(DUPLICATE_FOLLOW_UP_MESSAGE).toMatch(/already been written up/i);
  });
});
