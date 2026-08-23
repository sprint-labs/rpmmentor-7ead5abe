/**
 * Bulk Excel/CSV fixture import for the shared team calendar.
 *
 * Preview parsing runs locally; only an explicit confirm writes through
 * `commitFixtureImport` into `public.calendar_events`.
 *
 * Architecture: calendar_events is one goalkeeper + one mentor per row. A
 * spreadsheet row maps to one Match event. If a real-world fixture involves
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
  FixtureImportSummary,
  FixtureRosterPlayer,
  FixtureRowImportStatus,
  GoalkeeperMatchResult,
  GoalkeeperMatchStatus,
  ParsedFixtureRow,
  PreparedFixtureRow,
} from "./types";

export { parseFixtureCsv, parseFixtureMatrix, parseFixtureWorkbook } from "./parse";
export { matchGoalkeeperName, normalizePersonName, resolveGoalkeeperMatch } from "./match-goalkeepers";
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
