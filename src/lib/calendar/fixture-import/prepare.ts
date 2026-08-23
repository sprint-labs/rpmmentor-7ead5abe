/**
 * Turn parsed spreadsheet rows into a preview ready for human confirmation.
 */
import { findDuplicateEventId, indexExistingFixtureKeys } from "./duplicates";
import {
  buildFixtureDuplicateKey,
  buildFixtureNotes,
  buildFixtureTitle,
  embedFixtureDuplicateKey,
  normalizeHomeAway,
  parseFixtureDate,
  parseFixtureTime,
} from "./fields";
import { matchGoalkeeperName, resolveGoalkeeperMatch } from "./match-goalkeepers";
import type {
  ExistingCalendarEventRef,
  FixtureImportSummary,
  FixtureRosterPlayer,
  ParsedFixtureRow,
  PreparedFixtureRow,
} from "./types";

export interface PrepareFixtureImportOptions {
  rows: ParsedFixtureRow[];
  roster: readonly FixtureRosterPlayer[];
  existingEvents: readonly ExistingCalendarEventRef[];
  /** Applied when a row has no usable time cell. */
  defaultStartTime?: string | null;
  /** Manual GK resolutions keyed by spreadsheet row number. */
  goalkeeperResolutions?: Record<number, string>;
  /** Optional per-row time overrides (HH:MM). */
  timeOverrides?: Record<number, string>;
}

export function prepareFixtureImport(options: PrepareFixtureImportOptions): {
  rows: PreparedFixtureRow[];
  summary: FixtureImportSummary;
} {
  const existingIndex = indexExistingFixtureKeys(options.existingEvents);
  const defaultStartTime = options.defaultStartTime?.trim() || null;
  const resolutions = options.goalkeeperResolutions ?? {};
  const timeOverrides = options.timeOverrides ?? {};

  const rows: PreparedFixtureRow[] = [];
  for (const parsed of options.rows) {
    const row = prepareOne(parsed, {
      roster: options.roster,
      existingIndex,
      defaultStartTime,
      resolvedPlayerId: resolutions[parsed.rowNumber],
      timeOverride: timeOverrides[parsed.rowNumber],
    });
    // Later copies of the same fixture in this file are duplicates, not extra
    // ready rows. Commit already skips repeats via seenKeys; preview must too.
    if (row.status === "ready" && !row.duplicateKey.startsWith("incomplete:")) {
      existingIndex.set(row.duplicateKey, `import:${row.rowNumber}`);
    }
    rows.push(row);
  }

  return { rows, summary: summariseFixtureImport(rows) };
}

function prepareOne(
  parsed: ParsedFixtureRow,
  ctx: {
    roster: readonly FixtureRosterPlayer[];
    existingIndex: Map<string, string>;
    defaultStartTime: string | null;
    resolvedPlayerId?: string;
    timeOverride?: string;
  },
): PreparedFixtureRow {
  const errors: string[] = [];
  const eventDate = parseFixtureDate(parsed.dateRaw);
  if (!eventDate) errors.push("A valid date is required.");

  const startTime =
    parseFixtureTime(ctx.timeOverride ?? "") ??
    parseFixtureTime(parsed.timeRaw, parsed.dateRaw) ??
    parseFixtureTime(ctx.defaultStartTime ?? "");
  if (!startTime)
    errors.push("A start time is required (set a default kick-off or fill the Time column).");

  let goalkeeper = matchGoalkeeperName(parsed.goalkeeperRaw, ctx.roster);
  if (ctx.resolvedPlayerId) {
    goalkeeper = resolveGoalkeeperMatch(goalkeeper, ctx.resolvedPlayerId, ctx.roster);
  }
  if (!parsed.goalkeeperRaw.trim()) {
    errors.push("A goalkeeper name is required.");
  } else if (goalkeeper.status === "ambiguous") {
    errors.push(
      `Ambiguous goalkeeper “${parsed.goalkeeperRaw.trim()}” — choose the correct roster player.`,
    );
  } else if (goalkeeper.status === "unmatched" || !goalkeeper.playerId) {
    errors.push(
      `No roster match for “${parsed.goalkeeperRaw.trim()}” — choose an existing goalkeeper (new players are not created from imports).`,
    );
  }

  const homeAway = normalizeHomeAway(parsed.homeAwayRaw);
  if (parsed.homeAwayRaw.trim() && !homeAway) {
    errors.push("Home/Away must be H, A, Home or Away.");
  }

  if (!parsed.opponentRaw.trim() && !parsed.clubRaw.trim()) {
    errors.push("Opponent or club is required so the fixture can be titled.");
  }

  const title = buildFixtureTitle({
    club: parsed.clubRaw,
    opponent: parsed.opponentRaw,
    homeAway,
    competition: parsed.competitionRaw,
  });
  const location = parsed.venueRaw.trim() ? parsed.venueRaw.trim().slice(0, 160) : null;
  const baseNotes = buildFixtureNotes({
    club: parsed.clubRaw,
    opponent: parsed.opponentRaw,
    competition: parsed.competitionRaw,
    homeAway,
    venue: parsed.venueRaw,
    sourceGoalkeeper: parsed.goalkeeperRaw,
  });

  const duplicateKey =
    goalkeeper.playerId && eventDate && startTime
      ? buildFixtureDuplicateKey({
          playerId: goalkeeper.playerId,
          eventDate,
          startTime,
          club: parsed.clubRaw,
          opponent: parsed.opponentRaw,
          homeAway,
        })
      : `incomplete:${parsed.rowNumber}`;

  const notes = embedFixtureDuplicateKey(baseNotes, duplicateKey);
  if (notes.length > 4000) errors.push("Notes exceed 4000 characters.");

  const duplicateOfEventId = findDuplicateEventId(
    duplicateKey,
    title,
    goalkeeper.playerId,
    eventDate,
    startTime,
    ctx.existingIndex,
  );

  let status: PreparedFixtureRow["status"] = "ready";
  if (errors.some((e) => /goalkeeper/i.test(e))) status = "needs_goalkeeper";
  else if (errors.length) status = "invalid";
  else if (duplicateOfEventId) status = "duplicate";

  return {
    rowNumber: parsed.rowNumber,
    parsed,
    eventDate,
    startTime,
    homeAway,
    goalkeeper,
    title,
    location,
    notes,
    duplicateKey,
    status,
    errors,
    duplicateOfEventId,
  };
}

export function summariseFixtureImport(rows: readonly PreparedFixtureRow[]): FixtureImportSummary {
  let ready = 0;
  let duplicates = 0;
  let unmatchedGoalkeepers = 0;
  let ambiguousGoalkeepers = 0;
  let validationErrors = 0;

  for (const row of rows) {
    if (row.status === "ready") ready += 1;
    if (row.status === "duplicate") duplicates += 1;
    if (row.goalkeeper.status === "unmatched") unmatchedGoalkeepers += 1;
    if (row.goalkeeper.status === "ambiguous") ambiguousGoalkeepers += 1;
    if (row.status === "invalid" || row.status === "needs_goalkeeper") validationErrors += 1;
  }

  return {
    total: rows.length,
    ready,
    duplicates,
    unmatchedGoalkeepers,
    ambiguousGoalkeepers,
    validationErrors,
  };
}
