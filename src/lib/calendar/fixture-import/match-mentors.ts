/**
 * Mentor name matching for fixture import.
 *
 * Exact directory matches (case-insensitive) are accepted automatically.
 * Known RPM nicknames (Chambo, Rousey, …) resolve to the mentor's full name
 * first, then match. Ambiguous or unmatched names are flagged — never guessed.
 */
import { normalizePersonName } from "./match-goalkeepers";
import type { FixtureImportMentor, MentorMatchResult } from "./types";

/**
 * Spreadsheet nicknames → profile full names used by listAssignableMentors.
 * Keep this list small and explicit; do not invent nicknames.
 */
export const MENTOR_NICKNAME_ALIASES: Record<string, string> = {
  chambo: "Alec Chamberlain",
  wardy: "Gavin Ward",
  watto: "Dave Watson",
  marge: "Martyn Margetson",
  beads: "Matt Beadle",
  rousey: "David Rouse",
  marshy: "Andy Marshall",
};

export function matchMentorName(
  sourceName: string,
  mentors: readonly FixtureImportMentor[],
): MentorMatchResult {
  const trimmed = sourceName.trim();
  if (!trimmed) {
    return {
      status: "unmatched",
      mentorId: null,
      mentorName: null,
      candidates: [],
      sourceName: trimmed,
    };
  }

  const needle = normalizePersonName(trimmed);
  const aliasTarget = MENTOR_NICKNAME_ALIASES[needle];
  const resolvedNeedle = aliasTarget ? normalizePersonName(aliasTarget) : needle;

  const exact = mentors.filter((mentor) => normalizePersonName(mentor.name) === resolvedNeedle);

  if (exact.length === 1) {
    return {
      status: "exact",
      mentorId: exact[0].id,
      mentorName: exact[0].name,
      candidates: exact,
      sourceName: trimmed,
    };
  }

  if (exact.length > 1) {
    return {
      status: "ambiguous",
      mentorId: null,
      mentorName: null,
      candidates: exact,
      sourceName: trimmed,
    };
  }

  const tokenHits = mentors.filter((mentor) => {
    const parts = normalizePersonName(mentor.name).split(" ").filter(Boolean);
    return parts.includes(resolvedNeedle) || parts.includes(needle);
  });

  if (tokenHits.length > 1) {
    return {
      status: "ambiguous",
      mentorId: null,
      mentorName: null,
      candidates: tokenHits,
      sourceName: trimmed,
    };
  }

  return {
    status: "unmatched",
    mentorId: null,
    mentorName: null,
    candidates: tokenHits.length === 1 ? tokenHits : [],
    sourceName: trimmed,
  };
}

export function resolveMentorMatch(
  previous: MentorMatchResult,
  mentorId: string,
  mentors: readonly FixtureImportMentor[],
): MentorMatchResult {
  const mentor = mentors.find((row) => row.id === mentorId);
  if (!mentor) {
    return {
      ...previous,
      status: previous.candidates.length > 1 ? "ambiguous" : "unmatched",
      mentorId: null,
      mentorName: null,
    };
  }
  return {
    status: "resolved",
    mentorId: mentor.id,
    mentorName: mentor.name,
    candidates: previous.candidates.length ? previous.candidates : [mentor],
    sourceName: previous.sourceName,
  };
}
