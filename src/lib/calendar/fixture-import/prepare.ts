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
import { matchMentorName, resolveMentorMatch } from "./match-mentors";
import type {
  ExistingCalendarEventRef,
  FixtureImportMentor,
  FixtureImportSummary,
  FixtureRosterPlayer,
  MentorMatchResult,
  ParsedFixtureRow,
  PreparedFixtureRow,
} from "./types";

export interface PrepareFixtureImportOptions {
  rows: ParsedFixtureRow[];
  roster: readonly FixtureRosterPlayer[];
  /** Assignable mentors from listAssignableMentors. */
  mentors?: readonly FixtureImportMentor[];
  existingEvents: readonly ExistingCalendarEventRef[];
  /** Applied when a row has no usable time cell. */
  defaultStartTime?: string | null;
  /**
   * Fallback mentor UUID when a row has no Mentor cell.
   * Rows with an explicit Mentor column ignore this unless resolution overrides.
   */
  defaultMentorId?: string | null;
  /** Manual GK resolutions keyed by spreadsheet row number. */
  goalkeeperResolutions?: Record<number, string>;
  /** Manual mentor resolutions keyed by spreadsheet row number. */
  mentorResolutions?: Record<number, string>;
  /** Optional per-row time overrides (HH:MM). */
  timeOverrides?: Record<number, string>;
}

export function prepareFixtureImport(options: PrepareFixtureImportOptions): {
  rows: PreparedFixtureRow[];
  summary: FixtureImportSummary;
} {
  const existingIndex = indexExistingFixtureKeys(options.existingEvents);
  const defaultStartTime = options.defaultStartTime?.trim() || null;
  const defaultMentorId = options.defaultMentorId?.trim() || null;
  const mentors = options.mentors ?? [];
  const gkResolutions = options.goalkeeperResolutions ?? {};
  const mentorResolutions = options.mentorResolutions ?? {};
  const timeOverrides = options.timeOverrides ?? {};

  const rows = options.rows.map((parsed) =>
    prepareOne(parsed, {
      roster: options.roster,
      mentors,
      existingIndex,
      defaultStartTime,
      defaultMentorId,
      resolvedPlayerId: gkResolutions[parsed.rowNumber],
      resolvedMentorId: mentorResolutions[parsed.rowNumber],
      timeOverride: timeOverrides[parsed.rowNumber],
    }),
  );

  return { rows, summary: summariseFixtureImport(rows) };
}

function prepareOne(
  parsed: ParsedFixtureRow,
  ctx: {
    roster: readonly FixtureRosterPlayer[];
    mentors: readonly FixtureImportMentor[];
    existingIndex: Map<string, string>;
    defaultStartTime: string | null;
    defaultMentorId: string | null;
    resolvedPlayerId?: string;
    resolvedMentorId?: string;
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
  if (!startTime) errors.push("A start time is required (set a default kick-off or fill the Time column).");

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

  const mentor = resolveRowMentor(parsed, ctx);
  if (!mentor.mentorId) {
    if (!parsed.mentorRaw.trim() && !ctx.defaultMentorId) {
      errors.push("A mentor is required (Mentor column or fallback mentor attending).");
    } else if (mentor.status === "ambiguous") {
      errors.push(
        `Ambiguous mentor “${parsed.mentorRaw.trim()}” — choose the correct mentor.`,
      );
    } else if (parsed.mentorRaw.trim()) {
      errors.push(
        `No mentor directory match for “${parsed.mentorRaw.trim()}” — choose an assignable mentor.`,
      );
    } else {
      errors.push("Choose a fallback mentor attending, or fill the Mentor column.");
    }
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
  else if (errors.some((e) => /mentor/i.test(e))) status = "needs_mentor";
  else if (errors.length) status = "invalid";
  else if (duplicateOfEventId) status = "duplicate";

  return {
    rowNumber: parsed.rowNumber,
    parsed,
    eventDate,
    startTime,
    homeAway,
    goalkeeper,
    mentor,
    title,
    location,
    notes,
    duplicateKey,
    status,
    errors,
    duplicateOfEventId,
  };
}

function resolveRowMentor(
  parsed: ParsedFixtureRow,
  ctx: {
    mentors: readonly FixtureImportMentor[];
    defaultMentorId: string | null;
    resolvedMentorId?: string;
  },
): MentorMatchResult {
  if (ctx.resolvedMentorId) {
    const base = matchMentorName(parsed.mentorRaw || "manual", ctx.mentors);
    return resolveMentorMatch(base, ctx.resolvedMentorId, ctx.mentors);
  }

  if (parsed.mentorRaw.trim()) {
    return matchMentorName(parsed.mentorRaw, ctx.mentors);
  }

  if (ctx.defaultMentorId) {
    const mentor = ctx.mentors.find((row) => row.id === ctx.defaultMentorId);
    if (mentor) {
      return {
        status: "default",
        mentorId: mentor.id,
        mentorName: mentor.name,
        candidates: [mentor],
        sourceName: "",
      };
    }
    return {
      status: "unmatched",
      mentorId: null,
      mentorName: null,
      candidates: [],
      sourceName: "",
    };
  }

  return {
    status: "unmatched",
    mentorId: null,
    mentorName: null,
    candidates: [],
    sourceName: "",
  };
}

export function summariseFixtureImport(rows: readonly PreparedFixtureRow[]): FixtureImportSummary {
  let ready = 0;
  let duplicates = 0;
  let unmatchedGoalkeepers = 0;
  let ambiguousGoalkeepers = 0;
  let unmatchedMentors = 0;
  let ambiguousMentors = 0;
  let validationErrors = 0;

  for (const row of rows) {
    if (row.status === "ready") ready += 1;
    if (row.status === "duplicate") duplicates += 1;
    if (row.goalkeeper.status === "unmatched") unmatchedGoalkeepers += 1;
    if (row.goalkeeper.status === "ambiguous") ambiguousGoalkeepers += 1;
    if (row.mentor.status === "unmatched") unmatchedMentors += 1;
    if (row.mentor.status === "ambiguous") ambiguousMentors += 1;
    if (
      row.status === "invalid" ||
      row.status === "needs_goalkeeper" ||
      row.status === "needs_mentor"
    ) {
      validationErrors += 1;
    }
  }

  return {
    total: rows.length,
    ready,
    duplicates,
    unmatchedGoalkeepers,
    ambiguousGoalkeepers,
    unmatchedMentors,
    ambiguousMentors,
    validationErrors,
  };
}
