/**
 * Duty-of-care change detection for the notification inbox.
 *
 * `public.player_duty_of_care` — the `duty_of_care_at()` projection — is the
 * only thing entitled to decide a goalkeeper's duty status. The dashboard
 * headline, the `/goalkeepers` chips and each profile's Duty of Care panel all
 * read it. The notification inbox used to be the exception: it walked the
 * frozen `goalkeepers` seed array and recomputed a level client-side from the
 * `interactions` seed, which is empty. Every goalkeeper therefore read the same
 * level, nobody signed since the seed was captured could ever be announced, and
 * the snapshot it diffed against was a record of that fiction.
 *
 * Nothing here computes a status. These helpers pair the live roster with the
 * view's own rows and diff the result against the stored snapshot.
 *
 * ## Why the key stays a legacy `gk-…` slug
 *
 * `DutyNotif.gkId` is passed straight to `/goalkeepers/$gkId` by the header
 * bell and the alerts page, and that route param is the legacy slug — which is
 * also the id `toGoalkeeper` gives every live roster row. Keying on
 * `players.id` would break every "Open →" link and would orphan the snapshot
 * already in each user's `localStorage`, re-announcing the whole roster once.
 * So the slug is kept, derived from the live name by `legacyGkSlugForName`.
 */
import { buildRosterDutyIndex, rosterDutyFor } from "@/lib/duty-of-care-roster";
import type { PlayerDutyOfCareRow } from "@/lib/duty-of-care.functions";
import { legacyGkSlugForName } from "@/lib/goalkeeper-player-link";
import type { DutyLevel } from "@/lib/mock-data";

export type DutyNotif = {
  id: string;
  gkId: string;
  gkName: string;
  from: DutyLevel;
  to: DutyLevel;
  date: string;
  read: boolean;
};

/**
 * Levels a user has explicitly resolved, keyed by goalkeeper.
 *
 * Duty alerts are derived from the current roster on every load, so an
 * unresolved condition re-announces itself with a fresh id and reads as brand
 * new even after it has been seen. Resolving records the level that was
 * acknowledged; the same level stays silent until that goalkeeper's duty status
 * actually moves, which is the only point a new alert carries new information.
 */
export type ResolvedDutyLevels = Record<string, DutyLevel>;

/** Drop acknowledgements whose goalkeeper has since moved to a different level. */
export function pruneResolvedDutyLevels(
  resolved: ResolvedDutyLevels,
  currentLevels: Readonly<Record<string, DutyLevel>>,
): ResolvedDutyLevels {
  const next: ResolvedDutyLevels = {};
  for (const [gkId, level] of Object.entries(resolved)) {
    if (currentLevels[gkId] === level) next[gkId] = level;
  }
  return next;
}

/** True when this goalkeeper's arrival at `level` has already been resolved. */
export function isDutyLevelResolved(
  resolved: ResolvedDutyLevels,
  gkId: string,
  level: DutyLevel,
): boolean {
  return resolved[gkId] === level;
}

/** One live goalkeeper and the level the database view reports for them. */
export interface LiveDutyEntry {
  /** Legacy `gk-…` slug: the profile route param and the snapshot key. */
  gkId: string;
  gkName: string;
  level: DutyLevel;
}

/**
 * Pair the live roster with the view's rows.
 *
 * The roster is `public.players` (`listPlayers`), matched to the view by
 * normalised name exactly as `/goalkeepers` does it, so a goalkeeper's alert
 * and their roster chip cannot report different levels. A goalkeeper the view
 * does not cover reads `not_enough_data` — the same answer the roster gives —
 * rather than being dropped.
 */
export function liveDutyEntries(
  players: readonly { full_name: string }[] | null | undefined,
  dutyRows: readonly PlayerDutyOfCareRow[] | null | undefined,
  now = Date.now(),
): LiveDutyEntry[] {
  if (!Array.isArray(players)) return [];
  const index = buildRosterDutyIndex(Array.isArray(dutyRows) ? dutyRows : [], now);
  const entries: LiveDutyEntry[] = [];
  // Two roster rows can collapse to one slug (`Rich O'Donnell` and the curly
  // spelling). One goalkeeper is one alert, so the first row wins.
  const seen = new Set<string>();
  for (const player of players) {
    const name = player?.full_name?.trim();
    if (!name) continue;
    const gkId = legacyGkSlugForName(name);
    if (gkId === "gk-" || seen.has(gkId)) continue;
    seen.add(gkId);
    entries.push({ gkId, gkName: name, level: rosterDutyFor(index, name).level });
  }
  return entries;
}

/** The levels to store as the snapshot the next load diffs against. */
export function dutyLevelSnapshot(entries: readonly LiveDutyEntry[]): Record<string, DutyLevel> {
  const snapshot: Record<string, DutyLevel> = {};
  for (const entry of entries) snapshot[entry.gkId] = entry.level;
  return snapshot;
}

/**
 * The alerts a move since the last snapshot has earned.
 *
 * A goalkeeper absent from `previous` is new to this browser — a signing, or a
 * first load — and is recorded silently. Announcing them would mean a burst of
 * alerts about nothing having changed.
 */
export function dutyLevelChanges(
  entries: readonly LiveDutyEntry[],
  previous: Readonly<Record<string, DutyLevel>>,
  acknowledged: ResolvedDutyLevels,
  now = Date.now(),
): DutyNotif[] {
  const changes: DutyNotif[] = [];
  for (const entry of entries) {
    const prev = previous[entry.gkId];
    if (!prev || prev === entry.level) continue;
    if (isDutyLevelResolved(acknowledged, entry.gkId, entry.level)) continue;
    changes.push({
      id: `${entry.gkId}-${now}-${entry.level}`,
      gkId: entry.gkId,
      gkName: entry.gkName,
      from: prev,
      to: entry.level,
      date: new Date(now).toISOString(),
      read: false,
    });
  }
  return changes;
}

/**
 * The starting inbox for a browser that has no snapshot yet.
 *
 * There is no earlier level to compare against, so this states the conditions
 * that currently need attention rather than inventing transitions. It is
 * deliberately silent: no toast fires for a seeded item.
 */
export function seedFromLiveLevels(
  entries: readonly LiveDutyEntry[],
  now = Date.now(),
): DutyNotif[] {
  const seeded: DutyNotif[] = [];
  entries.forEach((entry, i) => {
    if (entry.level === "up_to_date" || entry.level === "not_required") return;
    seeded.push({
      id: `seed-${entry.gkId}`,
      gkId: entry.gkId,
      gkName: entry.gkName,
      from: "up_to_date",
      to: entry.level,
      date: new Date(now - 1000 * 60 * 60 * (6 + i * 3)).toISOString(),
      read: false,
    });
  });
  return seeded.sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 24);
}
