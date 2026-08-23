/**
 * Goalkeeper name matching for fixture import.
 *
 * Exact matches (case-insensitive, trimmed, collapsing internal whitespace) are
 * accepted automatically. Ambiguous or unmatched names are flagged — never
 * guessed, and never used to create a new `players` row.
 */
import type { FixtureRosterPlayer, GoalkeeperMatchResult } from "./types";

export function normalizePersonName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchGoalkeeperName(
  sourceName: string,
  roster: readonly FixtureRosterPlayer[],
): GoalkeeperMatchResult {
  const trimmed = sourceName.trim();
  if (!trimmed) {
    return {
      status: "unmatched",
      playerId: null,
      playerName: null,
      candidates: [],
      sourceName: trimmed,
    };
  }

  const needle = normalizePersonName(trimmed);
  const exact = roster.filter((player) => normalizePersonName(player.full_name) === needle);

  if (exact.length === 1) {
    return {
      status: "exact",
      playerId: exact[0].id,
      playerName: exact[0].full_name,
      candidates: exact,
      sourceName: trimmed,
    };
  }

  if (exact.length > 1) {
    return {
      status: "ambiguous",
      playerId: null,
      playerName: null,
      candidates: exact,
      sourceName: trimmed,
    };
  }

  // Partial token matches (first name or surname only) are never auto-accepted.
  // Multiple hits are ambiguous; a single hit is still unmatched but offered as
  // a suggested candidate for the user to confirm.
  const tokenHits = roster.filter((player) => {
    const parts = normalizePersonName(player.full_name).split(" ").filter(Boolean);
    return parts.includes(needle);
  });

  if (tokenHits.length > 1) {
    return {
      status: "ambiguous",
      playerId: null,
      playerName: null,
      candidates: tokenHits,
      sourceName: trimmed,
    };
  }

  return {
    status: "unmatched",
    playerId: null,
    playerName: null,
    candidates: tokenHits.length === 1 ? tokenHits : [],
    sourceName: trimmed,
  };
}

export function resolveGoalkeeperMatch(
  previous: GoalkeeperMatchResult,
  playerId: string,
  roster: readonly FixtureRosterPlayer[],
): GoalkeeperMatchResult {
  const player = roster.find((row) => row.id === playerId);
  if (!player) {
    return {
      ...previous,
      status: previous.candidates.length > 1 ? "ambiguous" : "unmatched",
      playerId: null,
      playerName: null,
    };
  }
  return {
    status: "resolved",
    playerId: player.id,
    playerName: player.full_name,
    candidates: previous.candidates.length ? previous.candidates : [player],
    sourceName: previous.sourceName,
  };
}
