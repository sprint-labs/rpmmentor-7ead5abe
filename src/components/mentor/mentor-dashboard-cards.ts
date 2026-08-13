/**
 * Base Mentor view intentionally excludes the Match Clips Posted metric.
 * Outstanding actions are presented as the breakdown list only, not a metric card.
 */
export const mentorDashboardMetricCardLabels = {
  matchReportsSubmitted: "Match Reports Submitted",
  interactionsLogged: "Interactions Logged",
} as const;

/** Primary mentor-home actions. Match report and interaction come first; calendar is next. */
export const mentorPrimaryActionLabels = {
  logMatchReport: "Submit a Match report",
  logInteraction: "Log interaction",
  viewCalendar: "View calendar",
} as const;
