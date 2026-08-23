/**
 * Field normalisation helpers for fixture import (dates, times, home/away,
 * calendar title/notes, duplicate keys).
 */

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

export function normalizeHomeAway(value: string): "H" | "A" | null {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (["h", "home", "h/a: h", "ha: h"].includes(raw)) return "H";
  if (["a", "away", "h/a: a", "ha: a"].includes(raw)) return "A";
  if (raw === "home/away") return null;
  if (/^h(ome)?$/.test(raw)) return "H";
  if (/^a(way)?$/.test(raw)) return "A";
  return null;
}

/** Convert a spreadsheet date cell into YYYY-MM-DD, or null when unusable. */
export function parseFixtureDate(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // Excel serial date (days since 1899-12-30), including fractional time.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) {
      // Outside ~1954–2119 — treat as not a date serial.
    } else {
      const wholeDays = Math.floor(serial);
      const ms = EXCEL_EPOCH_UTC + wholeDays * 86_400_000;
      const dt = new Date(ms);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY (UK fixture schedules).
  const uk = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (uk) {
    const day = Number(uk[1]);
    const month = Number(uk[2]);
    let year = Number(uk[3]);
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Already includes a time: take the date portion.
  const isoDateTime = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]/);
  if (isoDateTime) return isoDateTime[1];

  return null;
}

/** Convert a spreadsheet time cell into HH:MM, or null when unusable. */
export function parseFixtureTime(value: string, fallback?: string | null): string | null {
  const raw = value.trim();
  const tryParse = (input: string): string | null => {
    const s = input.trim();
    if (!s) return null;

    // Excel fractional day (0.625 → 15:00).
    if (/^0?\.\d+$/.test(s) || (/^\d+(\.\d+)?$/.test(s) && Number(s) < 1)) {
      const fraction = Number(s);
      if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) return null;
      const totalMinutes = Math.round(fraction * 24 * 60);
      const hh = Math.floor(totalMinutes / 60) % 24;
      const mm = totalMinutes % 60;
      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    // Combined date-time from SheetJS: "2026-08-15 15:00".
    const fromDateTime = s.match(/(?:^|[ T])(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp][Mm]))?$/);
    if (fromDateTime && s.includes("-")) {
      return normalizeClock(fromDateTime[1], fromDateTime[2], fromDateTime[3]);
    }

    const twelve = s.match(/^(\d{1,2})[:.](\d{2})\s*([AaPp][Mm])$/);
    if (twelve) return normalizeClock(twelve[1], twelve[2], twelve[3]);

    const twentyFour = s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?$/);
    if (twentyFour) return normalizeClock(twentyFour[1], twentyFour[2], undefined);

    const hourOnly = s.match(/^(\d{1,2})\s*([AaPp][Mm])$/);
    if (hourOnly) return normalizeClock(hourOnly[1], "00", hourOnly[2]);

    return null;
  };

  return tryParse(raw) ?? (fallback ? tryParse(fallback) : null);
}

function normalizeClock(hourRaw: string, minuteRaw: string, meridiem?: string): string | null {
  let hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (minute < 0 || minute > 59) return null;
  if (meridiem) {
    const m = meridiem.toLowerCase();
    if (hour < 1 || hour > 12) return null;
    if (m === "pm" && hour < 12) hour += 12;
    if (m === "am" && hour === 12) hour = 0;
  } else if (hour < 0 || hour > 23) {
    return null;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeDuplicateToken(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Idempotency key for a fixture-shaped calendar event.
 * Intentionally ignores mentor assignment so re-importing the same spreadsheet
 * under a different default mentor still skips rather than duplicating.
 */
export function buildFixtureDuplicateKey(input: {
  playerId: string;
  eventDate: string;
  startTime: string;
  club: string;
  opponent: string;
  homeAway: "H" | "A" | null;
}): string {
  return [
    input.playerId,
    input.eventDate,
    input.startTime,
    normalizeDuplicateToken(input.club),
    normalizeDuplicateToken(input.opponent),
    input.homeAway ?? "",
  ].join("|");
}

/** Marker embedded in notes so re-imports can recognise prior fixture rows. */
export const FIXTURE_IMPORT_KEY_PREFIX = "fixture-key:";

export function embedFixtureDuplicateKey(notes: string, duplicateKey: string): string {
  const marker = `${FIXTURE_IMPORT_KEY_PREFIX}${duplicateKey}`;
  const cleaned = notes
    .split("\n")
    .filter((line) => !line.trim().toLowerCase().startsWith(FIXTURE_IMPORT_KEY_PREFIX))
    .join("\n")
    .trim();
  return cleaned ? `${cleaned}\n\n${marker}` : marker;
}

export function extractFixtureDuplicateKey(notes: string): string | null {
  for (const line of notes.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith(FIXTURE_IMPORT_KEY_PREFIX)) {
      return trimmed.slice(FIXTURE_IMPORT_KEY_PREFIX.length).trim();
    }
  }
  return null;
}

export function buildFixtureTitle(input: {
  club: string;
  opponent: string;
  homeAway: "H" | "A" | null;
  competition: string;
}): string {
  const club = input.club.trim();
  const opponent = input.opponent.trim();
  let base: string;
  if (club && opponent) {
    if (input.homeAway === "A") base = `${opponent} v ${club}`;
    else base = `${club} v ${opponent}`;
  } else if (opponent) {
    base = input.homeAway === "A" ? `vs ${opponent} (A)` : `vs ${opponent}`;
  } else if (club) {
    base = club;
  } else {
    base = "Fixture";
  }
  const competition = input.competition.trim();
  const withComp = competition ? `${base} (${competition})` : base;
  return withComp.length > 160 ? withComp.slice(0, 160) : withComp;
}

export function buildFixtureNotes(input: {
  club: string;
  opponent: string;
  competition: string;
  homeAway: "H" | "A" | null;
  venue: string;
  sourceGoalkeeper: string;
}): string {
  const lines: string[] = ["Imported fixture"];
  if (input.club.trim()) lines.push(`Club: ${input.club.trim()}`);
  if (input.opponent.trim()) lines.push(`Opponent: ${input.opponent.trim()}`);
  if (input.competition.trim()) lines.push(`Competition: ${input.competition.trim()}`);
  if (input.homeAway) lines.push(`Home/Away: ${input.homeAway === "H" ? "Home" : "Away"}`);
  if (input.venue.trim()) lines.push(`Venue: ${input.venue.trim()}`);
  if (input.sourceGoalkeeper.trim()) lines.push(`Spreadsheet GK: ${input.sourceGoalkeeper.trim()}`);
  return lines.join("\n");
}
