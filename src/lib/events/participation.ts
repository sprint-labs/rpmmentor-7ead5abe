/** Whether the goalkeeper associated with a Match event actually took part. */
export const MATCH_PARTICIPATION_STATUSES = ["not_confirmed", "played", "did_not_play"] as const;

export type MatchParticipationStatus = (typeof MATCH_PARTICIPATION_STATUSES)[number];

/** Imported, historic and otherwise unspecified Match events must never imply participation. */
export const DEFAULT_MATCH_PARTICIPATION_STATUS = "not_confirmed" as const;

export const MATCH_PARTICIPATION_STATUS_LABEL: Record<MatchParticipationStatus, string> = {
  not_confirmed: "Not confirmed",
  played: "Played",
  did_not_play: "Did not play",
};

export function isMatchParticipationStatus(value: unknown): value is MatchParticipationStatus {
  return (MATCH_PARTICIPATION_STATUSES as readonly unknown[]).includes(value);
}

/**
 * Safely normalise persisted or provider-supplied participation data.
 *
 * Unknown values deliberately fail closed to `not_confirmed`: only the exact
 * `played` value may create a new Match Report obligation.
 */
export function normalizeMatchParticipationStatus(value: unknown): MatchParticipationStatus {
  return isMatchParticipationStatus(value) ? value : DEFAULT_MATCH_PARTICIPATION_STATUS;
}
