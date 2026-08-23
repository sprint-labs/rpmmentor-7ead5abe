/**
 * Duplicate detection for fixture import against existing calendar events.
 *
 * Prefers an embedded `fixture-key:` marker from a previous import. Falls back
 * to a structural match on goalkeeper + date + time + opponent/club tokens so
 * manually created near-identical Match events are also caught.
 */
import {
  buildFixtureDuplicateKey,
  extractFixtureDuplicateKey,
  normalizeDuplicateToken,
} from "./fields";
import type { ExistingCalendarEventRef } from "./types";

function timeKey(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

export function indexExistingFixtureKeys(
  existing: readonly ExistingCalendarEventRef[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const event of existing) {
    if (event.status === "cancelled") continue;
    const embedded = extractFixtureDuplicateKey(event.notes ?? "");
    if (embedded) {
      index.set(embedded, event.id);
      continue;
    }
    if (!event.player_id || !event.event_date) continue;
    const structural = buildFixtureDuplicateKey({
      playerId: event.player_id,
      eventDate: event.event_date,
      startTime: timeKey(event.start_time),
      club: "",
      opponent: "",
      homeAway: null,
    });
    // Structural fallback without club/opponent is too weak alone; instead index
    // a stronger composite from title/notes when possible.
    const opponent =
      /opponent:\s*(.+)/i.exec(event.notes ?? "")?.[1]?.trim() ??
      /\bv\s+(.+?)(?:\s*\(|$)/i.exec(event.title)?.[1]?.trim() ??
      "";
    const club =
      /club:\s*(.+)/i.exec(event.notes ?? "")?.[1]?.trim() ?? "";
    const homeAwayRaw = /home\/away:\s*(home|away)/i.exec(event.notes ?? "")?.[1];
    const homeAway = homeAwayRaw
      ? homeAwayRaw.toLowerCase() === "home"
        ? "H"
        : "A"
      : null;
    if (opponent || club) {
      index.set(
        buildFixtureDuplicateKey({
          playerId: event.player_id,
          eventDate: event.event_date,
          startTime: timeKey(event.start_time),
          club,
          opponent,
          homeAway,
        }),
        event.id,
      );
    } else {
      // Last-resort: same GK + date + kick-off + identical title.
      const weak = [
        event.player_id,
        event.event_date,
        timeKey(event.start_time),
        normalizeDuplicateToken(event.title),
      ].join("|");
      index.set(weak, event.id);
    }
    void structural;
  }
  return index;
}

export function findDuplicateEventId(
  duplicateKey: string,
  title: string,
  playerId: string | null,
  eventDate: string | null,
  startTime: string | null,
  existingIndex: Map<string, string>,
): string | null {
  if (existingIndex.has(duplicateKey)) return existingIndex.get(duplicateKey) ?? null;
  if (playerId && eventDate && startTime) {
    const weak = [playerId, eventDate, startTime, normalizeDuplicateToken(title)].join("|");
    if (existingIndex.has(weak)) return existingIndex.get(weak) ?? null;
  }
  return null;
}
