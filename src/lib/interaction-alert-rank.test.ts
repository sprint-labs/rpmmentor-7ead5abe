import { describe, expect, it } from "vitest";
import {
  compareAlertSeverity,
  compareInteractionsByAlertThenDate,
  interactionOutcomeAlertRank,
} from "./interaction-alert-rank";

describe("interactionOutcomeAlertRank", () => {
  it("ranks below-expectation outcomes first (red)", () => {
    expect(interactionOutcomeAlertRank("Below expectation")).toBe(0);
    expect(interactionOutcomeAlertRank("Needs follow-up")).toBe(1);
    expect(interactionOutcomeAlertRank("On track")).toBe(2);
    expect(interactionOutcomeAlertRank("Above expectation")).toBe(3);
  });
});

describe("compareInteractionsByAlertThenDate", () => {
  it("sorts red alerts before other outcomes, then by date", () => {
    const items = [
      { outcome: "On track", date: "2026-08-20" },
      { outcome: "Below expectation", date: "2026-08-10" },
      { outcome: "Below expectation", date: "2026-08-18" },
      { outcome: "Needs follow-up", date: "2026-08-19" },
    ];
    const sorted = [...items].sort(compareInteractionsByAlertThenDate);
    expect(sorted.map((i) => `${i.outcome}:${i.date}`)).toEqual([
      "Below expectation:2026-08-18",
      "Below expectation:2026-08-10",
      "Needs follow-up:2026-08-19",
      "On track:2026-08-20",
    ]);
  });
});

describe("compareAlertSeverity", () => {
  it("orders high before medium before low", () => {
    const items = [
      { severity: "low" as const },
      { severity: "high" as const },
      { severity: "medium" as const },
    ];
    expect([...items].sort(compareAlertSeverity).map((i) => i.severity)).toEqual([
      "high",
      "medium",
      "low",
    ]);
  });
});
