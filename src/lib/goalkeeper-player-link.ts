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
  return `gk-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
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

type LinkedPlayerProfile = {
  current_club: string;
  league: string;
  nationality: string;
  tier: string | null;
  on_loan: boolean;
  parent_club: string | null;
  instagram_url: string | null;
  contract_until: string | null;
};

type MockGoalkeeperProfile = {
  club: string;
  league: string;
  nationality: string;
  tier: string;
  onLoan?: boolean;
  parentClub?: string;
  instagram?: string;
  contractUntil: string;
};

/**
 * Profile fields that exist on both the mock roster and `public.players`.
 * A linked row is the live record: empty/false values must win, otherwise a
 * successful Edit Details save would keep showing the mock badge, loan pill,
 * Instagram link and contract date.
 */
export function goalkeeperProfileFields(
  linkedPlayer: LinkedPlayerProfile | null | undefined,
  gk: MockGoalkeeperProfile,
) {
  if (!linkedPlayer) {
    return {
      club: gk.club,
      league: gk.league,
      nationality: gk.nationality,
      tier: gk.tier,
      onLoan: Boolean(gk.onLoan),
      parentClub: gk.parentClub ?? "",
      instagram: gk.instagram ?? "",
      contractUntil: gk.contractUntil,
    };
  }
  return {
    club: linkedPlayer.current_club || gk.club,
    league: linkedPlayer.league || gk.league,
    nationality: linkedPlayer.nationality || gk.nationality,
    tier: linkedPlayer.tier ?? "",
    onLoan: linkedPlayer.on_loan,
    parentClub: linkedPlayer.parent_club ?? "",
    instagram: linkedPlayer.instagram_url ?? "",
    contractUntil: linkedPlayer.contract_until ?? "",
  };
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
