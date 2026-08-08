/**
 * Canonical competition suggestions for match reports.
 *
 * The form stays free-text (clubs play odd cups), but the datalist must include
 * domestic cups and age-group competitions — not only the league strings that
 * happen to appear on the current roster.
 */
export const COMPETITIONS = [
  // Senior leagues (common on the RPM roster)
  "Premier League",
  "EFL Championship",
  "EFL League One",
  "EFL League Two",
  "National League",
  "National League North",
  "National League South",
  "SPFL Premiership",
  "SPFL Championship",
  "NIFL Premiership",
  "League of Ireland Premier Division",
  "Allsvenskan",
  // Domestic cups
  "Carabao Cup",
  "EFL Trophy",
  "FA Cup",
  "FA Trophy",
  "Community Shield",
  // Age-group competitions
  "Premier League Under 18s",
  "Premier League Under 16s",
  "U18 Premier League",
  "U21 Premier League",
  "Premier League 2",
  "EFL Youth Alliance",
] as const;

export type Competition = (typeof COMPETITIONS)[number];
