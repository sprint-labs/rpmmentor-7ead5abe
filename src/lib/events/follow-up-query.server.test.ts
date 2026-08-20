import { describe, expect, it } from "vitest";
import { loadCompletions } from "./follow-up-query.server";

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
