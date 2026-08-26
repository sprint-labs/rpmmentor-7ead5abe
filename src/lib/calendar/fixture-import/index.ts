/**
 * Bulk Excel/CSV fixture import for the shared team calendar.
 *
 * Preview parsing runs locally; only an explicit confirm writes through
 * `commitFixtureImport` into `public.calendar_events`.
 *
 * Architecture: calendar_events is one goalkeeper + one mentor per row. A
 * spreadsheet row maps to one Match event. An optional Mentor column lets a
 * single upload assign different mentors per row; without it, the UI fallback
 * mentor attending applies to every ready row. If a real-world fixture involves
 * several RPM goalkeepers, the schedule should list one row per GK (creating
 * one scheduling/follow-up event each). Do not duplicate a shared fixture
 * entity inside this table — that would need a separate fixtures table plus a
 * junction to players (see comments in prepare.ts / the PR description). No
 * schema migration is applied by this feature.
 */
export type {
  ExistingCalendarEventRef,
  FixtureImportCommitResult,
  FixtureImportCommitResultRow,
  FixtureImportCommitRow,
  FixtureImportMentor,
  FixtureImportSummary,
  FixtureRosterPlayer,
  FixtureRowImportStatus,
  GoalkeeperMatchResult,
  GoalkeeperMatchStatus,
  MentorMatchResult,
  MentorMatchStatus,
  ParsedFixtureRow,
  PreparedFixtureRow,
} from "./types";

export { parseFixtureCsv, parseFixtureMatrix, parseFixtureWorkbook } from "./parse";
export { matchGoalkeeperName, normalizePersonName, resolveGoalkeeperMatch } from "./match-goalkeepers";
export {
  matchMentorName,
  MENTOR_NICKNAME_ALIASES,
  resolveMentorMatch,
} from "./match-mentors";
export {
  buildFixtureDuplicateKey,
  buildFixtureNotes,
  buildFixtureTitle,
  embedFixtureDuplicateKey,
  extractFixtureDuplicateKey,
  FIXTURE_IMPORT_KEY_PREFIX,
  normalizeHomeAway,
  parseFixtureDate,
  parseFixtureTime,
} from "./fields";
export { findDuplicateEventId, indexExistingFixtureKeys } from "./duplicates";
export { prepareFixtureImport, summariseFixtureImport } from "./prepare";
