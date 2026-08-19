/** Count distinct canonical player records; legacy/unlinked interaction slugs do not qualify. */
export function countCoveredPlayerRecords(
  interactions: ReadonlyArray<{ player_id: string | null }>,
): number {
  return new Set(interactions.map((row) => row.player_id).filter((id): id is string => Boolean(id)))
    .size;
}
