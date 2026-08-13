import { describe, expect, it } from "vitest";
import { mentorDashboardMetricCardLabels, mentorPrimaryActionLabels } from "./mentor-dashboard-cards";

describe("base Mentor dashboard metric cards", () => {
  it("keeps the three supported Mentor metrics", () => {
    expect(mentorDashboardMetricCardLabels).toEqual({
      matchReportsSubmitted: "Match Reports Submitted",
      interactionsLogged: "Interactions Logged",
      outstandingActions: "Outstanding Actions",
    });
  });

  it("does not render the Match Clips Posted metric", () => {
    expect(Object.values(mentorDashboardMetricCardLabels)).not.toContain("Match Clips Posted");
  });
});

describe("mentor home primary actions", () => {
  it("names match report, interaction, then calendar", () => {
    expect(mentorPrimaryActionLabels).toEqual({
      logMatchReport: "Log match report",
      logInteraction: "Log interaction",
      viewCalendar: "View calendar",
    });
  });
});
