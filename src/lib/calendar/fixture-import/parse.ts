/**
 * Spreadsheet → parsed fixture rows.
 *
 * Accepts .xlsx (and legacy .xls via SheetJS) as an ArrayBuffer, or a CSV/TSV
 * string. Nothing here touches Supabase — preview is entirely local.
 */
import * as XLSX from "xlsx";
import type { ParsedFixtureRow } from "./types";

const HEADER_ALIASES: Record<string, keyof Omit<ParsedFixtureRow, "rowNumber" | "raw">> = {
  date: "dateRaw",
  matchdate: "dateRaw",
  match_date: "dateRaw",
  fixturedate: "dateRaw",
  fixture_date: "dateRaw",
  kickoffdate: "dateRaw",
  "kick-offdate": "dateRaw",
  time: "timeRaw",
  kickoff: "timeRaw",
  "kick-off": "timeRaw",
  kick_off: "timeRaw",
  ko: "timeRaw",
  kickofftime: "timeRaw",
  goalkeeper: "goalkeeperRaw",
  gk: "goalkeeperRaw",
  player: "goalkeeperRaw",
  name: "goalkeeperRaw",
  goalkeepername: "goalkeeperRaw",
  club: "clubRaw",
  team: "clubRaw",
  side: "clubRaw",
  rpmclub: "clubRaw",
  opponent: "opponentRaw",
  opposition: "opponentRaw",
  vs: "opponentRaw",
  against: "opponentRaw",
  competition: "competitionRaw",
  comp: "competitionRaw",
  league: "competitionRaw",
  cup: "competitionRaw",
  venue: "venueRaw",
  location: "venueRaw",
  ground: "venueRaw",
  stadium: "venueRaw",
  homeaway: "homeAwayRaw",
  "home/away": "homeAwayRaw",
  home_away: "homeAwayRaw",
  ha: "homeAwayRaw",
  "h/a": "homeAwayRaw",
  venueha: "homeAwayRaw",
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "")
    .replace(/[_-]+/g, "");
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) {
    // SheetJS may leave Excel date serials as numbers when cellDates is off.
    return String(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel serials are timezone-naive day numbers. SheetJS materialises them as
    // absolute instants (typically UTC midnight); local getters would shift the
    // calendar day for viewers west of UTC.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    const hh = String(value.getUTCHours()).padStart(2, "0");
    const mm = String(value.getUTCMinutes()).padStart(2, "0");
    if (hh === "00" && mm === "00") return `${y}-${m}-${d}`;
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }
  return String(value).trim();
}

function emptyParsed(rowNumber: number, raw: Record<string, string>): ParsedFixtureRow {
  return {
    rowNumber,
    raw,
    dateRaw: "",
    timeRaw: "",
    goalkeeperRaw: "",
    clubRaw: "",
    opponentRaw: "",
    competitionRaw: "",
    venueRaw: "",
    homeAwayRaw: "",
  };
}

/**
 * Map a sheet matrix (including header row) into parsed fixture rows.
 * Unknown columns are preserved under `raw` but otherwise ignored.
 */
export function parseFixtureMatrix(matrix: unknown[][]): ParsedFixtureRow[] {
  if (!matrix.length) return [];

  const headerCells = (matrix[0] ?? []).map((cell) => cellToString(cell));
  const columnMap = new Map<number, keyof Omit<ParsedFixtureRow, "rowNumber" | "raw">>();

  headerCells.forEach((header, index) => {
    const key = normalizeHeader(header);
    const field = HEADER_ALIASES[key];
    if (field) columnMap.set(index, field);
  });

  if (columnMap.size === 0) {
    throw new Error(
      "Could not recognise any fixture columns. Include headers such as Date, Time, Goalkeeper, Club, Opponent, Competition, Venue and Home/Away.",
    );
  }

  const rows: ParsedFixtureRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = matrix[i] ?? [];
    const raw: Record<string, string> = {};
    headerCells.forEach((header, index) => {
      if (!header) return;
      raw[header] = cellToString(line[index]);
    });

    const parsed = emptyParsed(i + 1, raw);
    for (const [index, field] of columnMap) {
      parsed[field] = cellToString(line[index]);
    }

    const hasContent = Object.values(raw).some((v) => v.trim().length > 0);
    if (!hasContent) continue;
    rows.push(parsed);
  }

  return rows;
}

/** Parse an uploaded workbook (.xlsx / .xls) from its binary contents. */
export function parseFixtureWorkbook(data: ArrayBuffer | Uint8Array): ParsedFixtureRow[] {
  const workbook = XLSX.read(data, {
    type: "array",
    cellDates: true,
    raw: false,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The spreadsheet has no sheets to read.");
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  }) as unknown[][];
  return parseFixtureMatrix(matrix);
}

/** Parse CSV/TSV text (useful in tests and for .csv uploads). */
export function parseFixtureCsv(text: string): ParsedFixtureRow[] {
  const workbook = XLSX.read(text, { type: "string", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The CSV content is empty.");
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }) as unknown[][];
  return parseFixtureMatrix(matrix);
}
