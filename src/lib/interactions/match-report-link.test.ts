import { describe, expect, it, vi } from "vitest";
import {
  ensureMatchReportInteraction,
  matchReportInteractionNotes,
} from "@/lib/interactions/match-report-link";

const REPORT_ID = "mr2_ab12cd34";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    gk_slug: "",
    goalkeeper_name: "Tom Watson",
    player_id: "p1",
    mentor_id: "u1",
    mentor_name: "David Rouse",
    interaction_type: "Live Match Observation",
    club: "Rotherham United",
    occurred_at: "2026-07-09",
    notes: "Match report submitted v Barnsley",
    outcome: "",
    follow_up: "",
    created_at: "2026-07-09T18:00:00.000Z",
    match_report_id: REPORT_ID,
    updated_at: null,
    updated_by: null,
    ...overrides,
  };
}

/**
 * Minimal Supabase query-builder stand-in. `interactions` selects resolve to
 * `existing`, and the insert resolves to whatever `insertResult` provides.
 */
function makeDb(opts: {
  existing?: Record<string, unknown> | null;
  insertResult?: { data?: unknown; error?: { code?: string; message: string } | null };
  onInsert?: (payload: Record<string, unknown>) => void;
}) {
  const selectQueue = [opts.existing ?? null, opts.existing ?? null];
  const from = vi.fn((table: string) => {
    if (table === "players") {
      return {
        select: () => ({
          ilike: () => ({
            is: (column: string, value: unknown) => {
              expect(column).toBe("deleted_at");
              expect(value).toBeNull();
              return { maybeSingle: async () => ({ data: { id: "p1" } }) };
            },
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          is: (column: string, value: unknown) => {
            expect(column).toBe("deleted_at");
            expect(value).toBeNull();
            return {
              maybeSingle: async () => ({ data: selectQueue.shift() ?? null, error: null }),
            };
          },
        }),
      }),
      insert: (payload: Record<string, unknown>) => {
        opts.onInsert?.(payload);
        return {
          select: () => ({
            single: async () => opts.insertResult ?? { data: row(), error: null },
          }),
        };
      },
    };
  });
  return { from, calls: from };
}

const input = {
  reportId: REPORT_ID,
  goalkeeperName: "Tom Watson",
  club: "Rotherham United",
  matchDate: "2026-07-09",
  mentorId: "u1",
  mentorName: "David Rouse",
  notes: "Match report submitted v Barnsley",
};

describe("ensureMatchReportInteraction", () => {
  it("creates the interaction with the report's goalkeeper, date and club", async () => {
    let captured: Record<string, unknown> = {};
    const db = makeDb({ existing: null, onInsert: (p) => (captured = p) });

    const result = await ensureMatchReportInteraction(db, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(true);
    expect(result.interaction.interactionType).toBe("Live Match Observation");
    expect(captured.goalkeeper_name).toBe("Tom Watson");
    expect(captured.occurred_at).toBe("2026-07-09");
    expect(captured.club).toBe("Rotherham United");
    // Keyed on the report, which is what the unique index enforces.
    expect(captured.match_report_id).toBe(REPORT_ID);
  });

  it("does not create a second interaction when one already exists for the report", async () => {
    const insert = vi.fn();
    const db = makeDb({ existing: row(), onInsert: insert });

    const result = await ensureMatchReportInteraction(db, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    expect(result.interaction.id).toBe("row-1");
    expect(insert).not.toHaveBeenCalled();
  });

  it("treats a unique violation as a concurrent winner rather than a failure", async () => {
    // First read finds nothing, the insert races and loses, the re-read wins.
    const selectResults = [null, row()];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            is: (column: string, value: unknown) => {
              expect(column).toBe("deleted_at");
              expect(value).toBeNull();
              return {
                maybeSingle: async () => ({ data: selectResults.shift() ?? null, error: null }),
              };
            },
          }),
          ilike: () => ({
            is: (column: string, value: unknown) => {
              expect(column).toBe("deleted_at");
              expect(value).toBeNull();
              return { maybeSingle: async () => ({ data: { id: "p1" } }) };
            },
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: null,
              error: { code: "23505", message: "duplicate key value" },
            }),
          }),
        }),
      }),
    };

    const result = await ensureMatchReportInteraction(db, input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.created).toBe(false);
    expect(result.interaction.matchReportId).toBe(REPORT_ID);
  });

  it("reports a failure instead of throwing, so a written report is never lost", async () => {
    const db = makeDb({
      existing: null,
      insertResult: { data: null, error: { message: "permission denied" } },
    });

    const result = await ensureMatchReportInteraction(db, input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("permission denied");
  });
});

describe("matchReportInteractionNotes", () => {
  it("summarises the fixture so the interaction reads on its own", () => {
    const notes = matchReportInteractionNotes({
      opponent: "Barnsley",
      competition: "League One",
      average: 3.857,
      comments: "Strong in the air.",
    });
    expect(notes).toContain("v Barnsley");
    expect(notes).toContain("League One");
    expect(notes).toContain("3.86");
    expect(notes).toContain("Strong in the air.");
  });

  it("omits an absent average and comments rather than printing blanks", () => {
    const notes = matchReportInteractionNotes({ opponent: "Barnsley" });
    expect(notes).toBe("Match report submitted v Barnsley");
  });
});
