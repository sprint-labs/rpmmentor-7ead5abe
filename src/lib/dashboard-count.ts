export interface ExactCountResult {
  count: number | null;
  error: unknown;
}

/** Keep a genuine zero, but never disguise a failed or missing count as zero. */
export function requireExactDashboardCount(result: ExactCountResult, label: string): number {
  if (result.error || typeof result.count !== "number") {
    throw new Error(`Could not load the ${label}.`);
  }
  return result.count;
}
