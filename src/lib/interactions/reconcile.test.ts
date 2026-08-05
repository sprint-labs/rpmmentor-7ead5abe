import { describe, expect, it } from "vitest";
import { reconcileInteraction } from "@/lib/interactions/map";
import type { LoggedInteraction } from "@/lib/interactions/schema";

const base: LoggedInteraction = {
  id: "opt-1", gkSlug: "gk-a", goalkeeperName: "Keeper A", playerId: null,
  mentorId: "", mentorName: "", interactionType: "Phone Call", club: "Club A",
  occurredAt: "2026-01-05", notes: "n", outcome: "On track", followUp: "f",
  createdAt: "2026-01-05T10:00:00.000Z",
};
const saved: LoggedInteraction = {
  ...base, id: "row-1", playerId: "p1", mentorId: "u1", mentorName: "Mentor",
  createdAt: "2026-01-05T10:00:05.000Z",
};

describe("reconcileInteraction", () => {
  it("replaces the optimistic row with the server id, timestamps and fields", () => {
    const out = reconcileInteraction([base], "opt-1", saved);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("row-1");
    expect(out[0]!.mentorName).toBe("Mentor");
    expect(out[0]!.playerId).toBe("p1");
    expect(out[0]!.createdAt).toBe("2026-01-05T10:00:05.000Z");
  });

  it("keeps optimistic values for fields the server returned empty", () => {
    const out = reconcileInteraction([base], "opt-1", { ...saved, outcome: "", club: "" });
    expect(out[0]!.outcome).toBe("On track");
    expect(out[0]!.club).toBe("Club A");
  });

  it("inserts the saved row when no optimistic row is present and de-dupes by id", () => {
    const out = reconcileInteraction([saved], "opt-1", saved);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("row-1");
  });

  it("sorts by occurredAt then createdAt descending", () => {
    const older = { ...base, id: "old", occurredAt: "2025-12-01" };
    const out = reconcileInteraction([older, base], "opt-1", saved);
    expect(out.map((i) => i.id)).toEqual(["row-1", "old"]);
  });
});
