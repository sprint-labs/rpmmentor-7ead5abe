/** Base Mentor view intentionally excludes the Match Clips Posted metric. */
export const mentorDashboardMetricCardLabels = {
  matchReportsSubmitted: "Match Reports Submitted",
  interactionsLogged: "Interactions Logged",
  outstandingActions: "Outstanding Actions",
} as const;

/** Primary mentor-home actions. Match report and interaction come first; calendar is next. */
export const mentorPrimaryActionLabels = {
  logMatchReport: "Log match report",
  logInteraction: "Log interaction",
  viewCalendar: "View calendar",
} as const;
