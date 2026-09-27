/** All-competitions totals for one completed season (Goal.com shape). */
export type GoalkeeperSeasonStats = {
  seasonLabel: string;
  appearances: number;
  startingEleven: number;
  minutesPlayed: number;
  yellowCards: number;
  redCards: number;
  foulsCommitted: number;
  foulsSuffered: number;
  goalsConceded: number;
  cleanSheets: number;
  saves: number;
  penaltySaves: number;
};

export const SEASON_STAT_ROWS: ReadonlyArray<{
  key: keyof GoalkeeperSeasonStats;
  label: string;
}> = [
  { key: "appearances", label: "Appearances" },
  { key: "startingEleven", label: "Starting eleven" },
  { key: "minutesPlayed", label: "Mins played" },
  { key: "yellowCards", label: "Yellow cards" },
  { key: "redCards", label: "Red cards" },
  { key: "foulsCommitted", label: "Fouls commited" },
  { key: "foulsSuffered", label: "Fouls suffered" },
  { key: "goalsConceded", label: "Goals conceded" },
  { key: "cleanSheets", label: "Clean sheets" },
  { key: "saves", label: "Saves" },
  { key: "penaltySaves", label: "Penalty saves" },
];
