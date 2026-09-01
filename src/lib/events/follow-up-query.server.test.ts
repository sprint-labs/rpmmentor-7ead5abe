import { describe, expect, it } from "vitest";
import {
  loadCompletions,
  toFollowUpRow,
  type EventRow,
} from "./follow-up-query.server";

const USER_ID = "22222222-2222-4222-8222-222222222222";

function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Test fixture",
    event_type: "Match",
    event_date: "2026-08-15",
    start_time: "15:00",
    end_time: null,
    location: null,
    notes: null,
    participation_status: null,
    player_id: "33333333-3333-4333-8333-333333333333",
    goalkeeper_name: "Test Keeper",
    assigned_mentor_id: USER_ID,
    assigned_mentor_name: "Test Mentor",
    status: "scheduled",
    cancellation_reason: "",
    follow_up_waived_at: null,
    follow_up_waived_by: null,
    follow_up_waiver_reason: "",
    ...overrides,
  };
}

describe("loadCompletions", () => {
  it("excludes tombstoned interactions from completed follow-ups", async () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const activeFilters: Array<[string, unknown]> = [];
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          is: (column: string, value: unknown) => {
            if (table === "interactions") activeFilters.push([column, value]);
            return {
              in: async () => ({
                data:
                  table === "interactions"
                    ? [{ id: "interaction-1", calendar_event_id: eventId }]
                    : [],
                error: null,
              }),
            };
          },
        }),
      }),
    };

    const result = await loadCompletions(supabase, [eventId]);

    expect(activeFilters).toEqual([["deleted_at", null]]);
    expect(result.get(eventId)).toBe("interaction-1");
  });
});

describe("toFollowUpRow", () => {
  it("fails historic rows without participation closed to confirmation, not overdue", () => {
    const row = toFollowUpRow(
      eventRow(),
      null,
      USER_ID,
      Date.parse("2026-08-20T12:00:00Z"),
    );
    expect(row.participationStatus).toBe("not_confirmed");
    expect(row.followUp.status).toBe("confirmation_needed");
  });

  it("retains a linked existing Match Report without changing either record", () => {
    const row = toFollowUpRow(
      eventRow(),
      "historic-report-id",
      USER_ID,
      Date.parse("2026-08-20T12:00:00Z"),
    );
    expect(row.followUp.status).toBe("completed");
    expect(row.followUp.completedRecordId).toBe("historic-report-id");
  });
});
