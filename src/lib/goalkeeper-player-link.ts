/**
 * Bridges legacy goalkeeper profile slugs (`gk-…`) and canonical `players` rows.
 *
 * Interactions may be stored with a player id, a legacy slug, both, or only a
 * display name — timeline and club-edit surfaces must recognise all of those.
 */

export function normalisePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Deterministic legacy slug used by the mock roster (`gk-harrison-male`). */
export function legacyGkSlugForName(name: string): string {
  return `gk-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function findPlayerByName<T extends { full_name: string }>(
  players: readonly T[] | null | undefined,
  name: string,
): T | null {
  if (!players?.length) return null;
  const key = normalisePersonName(name);
  if (!key) return null;
  return players.find((p) => normalisePersonName(p.full_name) === key) ?? null;
}

export function interactionBelongsToGoalkeeper(
  interaction: {
    gkSlug: string;
    goalkeeperName: string;
    playerId: string | null;
  },
  gk: { id: string; name: string },
  linkedPlayerId: string | null,
): boolean {
  if (interaction.gkSlug && interaction.gkSlug === gk.id) return true;
  if (linkedPlayerId && interaction.playerId === linkedPlayerId) return true;
  if (
    interaction.goalkeeperName &&
    normalisePersonName(interaction.goalkeeperName) === normalisePersonName(gk.name)
  ) {
    return true;
  }
  return false;
}
