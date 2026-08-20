/** Count distinct canonical player records; legacy/unlinked interaction slugs do not qualify. */
export function countCoveredPlayerRecords(
  interactions: ReadonlyArray<{ player_id: string | null }>,
  activePlayerIds?: ReadonlySet<string>,
): number {
  return new Set(
    interactions
      .map((row) => row.player_id)
      .filter(
        (id): id is string =>
          Boolean(id) && (!activePlayerIds || activePlayerIds.has(id as string)),
      ),
  ).size;
}
