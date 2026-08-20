import { describe, expect, it } from "vitest";
import { playerDeletionBlockMessage, playerRecordUpdateSchema } from "@/lib/players.functions";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";

function validPlayerUpdate(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_ID,
    currentClub: "Stevenage",
    parentClub: "Stevenage",
    onLoan: false,
    league: "EFL League One",
    nationality: "Wales",
    instagramUrl: "https://www.instagram.com/example/",
    contractUntil: "June 2027",
    ...overrides,
  };
}

describe("playerRecordUpdateSchema", () => {
  it("accepts and normalises editable non-identity player fields", () => {
    expect(
      playerRecordUpdateSchema.parse(
        validPlayerUpdate({
          currentClub: "  Stevenage  ",
          parentClub: "  ",
          instagramUrl: "  https://www.instagram.com/example/  ",
          contractUntil: "",
        }),
      ),
    ).toEqual({
      id: PLAYER_ID,
      currentClub: "Stevenage",
      parentClub: null,
      onLoan: false,
      league: "EFL League One",
      nationality: "Wales",
      instagramUrl: "https://www.instagram.com/example/",
      contractUntil: null,
    });
  });

  it("strips attempted identity and tombstone changes", () => {
    const parsed = playerRecordUpdateSchema.parse(
      validPlayerUpdate({
        fullName: "Renamed Player",
        deletedAt: "2026-08-20T12:00:00.000Z",
        deletedBy: "22222222-2222-4222-8222-222222222222",
      }),
    ) as Record<string, unknown>;

    expect(parsed.id).toBe(PLAYER_ID);
    expect(parsed).not.toHaveProperty("fullName");
    expect(parsed).not.toHaveProperty("deletedAt");
    expect(parsed).not.toHaveProperty("deletedBy");
  });

  it("rejects invalid Instagram URLs", () => {
    expect(() =>
      playerRecordUpdateSchema.parse(validPlayerUpdate({ instagramUrl: "instagram.com/example" })),
    ).toThrow(/valid web address/i);
    expect(() =>
      playerRecordUpdateSchema.parse(validPlayerUpdate({ instagramUrl: "javascript:alert(1)" })),
    ).toThrow(/valid web address/i);
  });
});

describe("playerDeletionBlockMessage", () => {
  it("allows deletion when there are no upcoming calendar events", () => {
    expect(
      playerDeletionBlockMessage({ interactionCount: 4, openCalendarEventCount: 0 }),
    ).toBeNull();
  });

  it("uses singular and plural blocking copy for upcoming calendar events", () => {
    expect(playerDeletionBlockMessage({ interactionCount: 0, openCalendarEventCount: 1 })).toBe(
      "Resolve 1 upcoming calendar event before deleting this player record.",
    );
    expect(playerDeletionBlockMessage({ interactionCount: 0, openCalendarEventCount: 2 })).toBe(
      "Resolve 2 upcoming calendar events before deleting this player record.",
    );
  });
});
