/**
 * Rank interaction outcomes so concerning / "red" results surface first.
 * Lower number = higher priority in sorted lists.
 */
export function interactionOutcomeAlertRank(outcome: string): number {
  const key = outcome.trim().toLowerCase();
  if (
    key.includes("below") ||
    key.includes("concern") ||
    key.includes("at risk") ||
    key.includes("overdue") ||
    key.includes("red")
  ) {
    return 0;
  }
  if (
    key.includes("follow-up") ||
    key.includes("follow up") ||
    key.includes("needs") ||
    key.includes("action")
  ) {
    return 1;
  }
  if (key.includes("above") || key.includes("exceed")) {
    return 3;
  }
  return 2;
}

/** Sort interactions: red alerts first, then by most recent date. */
export function compareInteractionsByAlertThenDate(
  a: { outcome: string; date: string },
  b: { outcome: string; date: string },
): number {
  const rankDiff = interactionOutcomeAlertRank(a.outcome) - interactionOutcomeAlertRank(b.outcome);
  if (rankDiff !== 0) return rankDiff;
  return +new Date(b.date) - +new Date(a.date);
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function compareAlertSeverity(
  a: { severity: "high" | "medium" | "low" },
  b: { severity: "high" | "medium" | "low" },
): number {
  return (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
}
