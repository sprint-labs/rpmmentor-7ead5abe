import { describe, it, expect } from "vitest";
import {
  createInteractionInput,
  updateInteractionInput,
  formatDateOnly,
  dateOnlyToLocalMs,
  todayDateOnly,
  MANUAL_INTERACTION_TYPES,
  DASHBOARD_INTERACTION_TYPES,
  MATCH_REPORT_INTERACTION_TYPE,
  interactionTypeForEdit,
  isDashboardInteractionType,
} from "@/lib/interactions/schema";

import { mapInteractionRow, type InteractionDbRow } from "@/lib/interactions/map";
import { computeDutyOverview, goalkeepers } from "@/lib/mock-data";

const validInput = {
  gkSlug: "gk-demo",
  goalkeeperName: "Demo Keeper",
  interactionType: "Coffee Catch Up",
  club: "Demo FC",
  occurredAt: "2026-01-05",
  notes: "Checked in on recovery plan.",
  outcome: "On track",
  followUp: "",
};

describe("interaction input validation", () => {
  it("accepts every manually loggable interaction type", () => {
    for (const t of MANUAL_INTERACTION_TYPES) {
      expect(
        createInteractionInput.parse({ ...validInput, interactionType: t }).interactionType,
      ).toBe(t);
    }
  });

  it("keeps the allowed types identical to the dashboard list", () => {
    expect([...DASHBOARD_INTERACTION_TYPES]).toEqual([...MANUAL_INTERACTION_TYPES]);
    expect(MANUAL_INTERACTION_TYPES).not.toContain(MATCH_REPORT_INTERACTION_TYPE);
  });

  it("keeps report-generated observations out of dashboard interaction totals", () => {
    expect(isDashboardInteractionType("Coffee Catch Up")).toBe(true);
    expect(isDashboardInteractionType(MATCH_REPORT_INTERACTION_TYPE)).toBe(false);
    expect(isDashboardInteractionType("Unknown interaction")).toBe(false);
  });

  it("rejects Live Match Observation on create", () => {
    expect(() =>
      createInteractionInput.parse({
        ...validInput,
        interactionType: MATCH_REPORT_INTERACTION_TYPE,
      }),
    ).toThrow();
  });

  it("accepts Live Match Observation on update so report rows stay correctable", () => {
    // The server keeps the stored type; the validator only has to let the
    // existing value round-trip instead of blocking the edit outright.
    expect(
      updateInteractionInput.parse({
        ...validInput,
        id: "11111111-1111-4111-8111-111111111111",
        interactionType: MATCH_REPORT_INTERACTION_TYPE,
      }).interactionType,
    ).toBe(MATCH_REPORT_INTERACTION_TYPE);
  });

  it("rejects an unknown interaction type", () => {
    expect(() =>
      createInteractionInput.parse({ ...validInput, interactionType: "Face to Face" }),
    ).toThrow();
  });

  it("rejects a timestamp in the calendar-date field", () => {
    expect(() =>
      createInteractionInput.parse({ ...validInput, occurredAt: "2026-01-05T22:30:00Z" }),
    ).toThrow();
  });

  it("requires notes and a goalkeeper", () => {
    expect(() => createInteractionInput.parse({ ...validInput, notes: "  " })).toThrow();
    expect(() => createInteractionInput.parse({ ...validInput, goalkeeperName: "" })).toThrow();
  });

  it("keeps the editable club snapshot and defaults it safely", () => {
    expect(createInteractionInput.parse(validInput).club).toBe("Demo FC");
    const { club: _club, ...noClub } = validInput;
    expect(createInteractionInput.parse(noClub).club).toBe("");
  });

  it("never accepts mentor identity from the client", () => {
    const parsed = createInteractionInput.parse({
      ...validInput,
      mentorId: "attacker-uuid",
    }) as Record<string, unknown>;
    expect(parsed["mentorId"]).toBeUndefined();
  });
});

describe("interaction type editing", () => {
  it("keeps the stored type for a calendar-linked interaction", () => {
    expect(
      interactionTypeForEdit(
        "Coffee Catch Up",
        "11111111-1111-4111-8111-111111111111",
        "Training Ground Visit",
      ),
    ).toBe("Coffee Catch Up");
  });

  it("keeps Match Report observations immutable and lets ordinary entries change", () => {
    expect(interactionTypeForEdit(MATCH_REPORT_INTERACTION_TYPE, null, "Phone Call")).toBe(
      MATCH_REPORT_INTERACTION_TYPE,
    );
    expect(interactionTypeForEdit("Phone Call", null, "Coffee Catch Up")).toBe("Coffee Catch Up");
  });
});

describe("calendar date preservation", () => {
  it("does not shift the day when formatting", () => {
    expect(formatDateOnly("2026-01-05")).toContain("05");
    expect(formatDateOnly("2026-01-01")).toContain("01 Jan 2026");
  });

  it("maps a date column through without timezone parsing", () => {
    const row: InteractionDbRow = {
      id: "1",
      gk_slug: "gk-demo",
      goalkeeper_name: "Demo Keeper",
      player_id: null,
      mentor_id: "m1",
      mentor_name: "Mentor",
      interaction_type: "Phone Call",
      club: null,
      occurred_at: "2026-01-05",
      notes: null,
      outcome: null,
      follow_up: null,
      created_at: "2026-01-05T10:00:00Z",
    };
    const mapped = mapInteractionRow(row);
    expect(mapped.occurredAt).toBe("2026-01-05");
    expect(formatDateOnly(mapped.occurredAt)).toBe(formatDateOnly("2026-01-05"));
    expect(new Date(dateOnlyToLocalMs(mapped.occurredAt)).getDate()).toBe(5);
    expect(mapped.club).toBe("");
  });

  it("todayDateOnly returns the local calendar day", () => {
    const now = new Date();
    expect(todayDateOnly(now).slice(8)).toBe(String(now.getDate()).padStart(2, "0"));
  });
});

describe("duty-of-care reads durable interactions", () => {
  it("counts a recent qualifying interaction as up to date", () => {
    const gk = goalkeepers.find((g) => g.status !== "Tier 4");
    expect(gk).toBeDefined();
    const empty = computeDutyOverview([]);
    const withRecent = computeDutyOverview([
      { gkId: gk!.id, type: "Coffee Catch Up", date: todayDateOnly() },
    ]);
    expect(withRecent.up_to_date).toBe(empty.up_to_date + 1);
    expect(withRecent.total).toBe(empty.total);
  });
});
