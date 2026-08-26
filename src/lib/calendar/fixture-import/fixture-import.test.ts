import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildFixtureDuplicateKey,
  embedFixtureDuplicateKey,
  extractFixtureDuplicateKey,
  findDuplicateEventId,
  indexExistingFixtureKeys,
  matchGoalkeeperName,
  matchMentorName,
  normalizeHomeAway,
  parseFixtureCsv,
  parseFixtureDate,
  parseFixtureMatrix,
  parseFixtureTime,
  parseFixtureWorkbook,
  prepareFixtureImport,
  summariseFixtureImport,
} from "@/lib/calendar/fixture-import";

const ROSTER = [
  { id: "11111111-1111-4111-8111-111111111111", full_name: "James Beadle", current_club: "Charlton Athletic" },
  { id: "33333333-3333-4333-8333-333333333333", full_name: "Kjell Scherpen", current_club: "Brighton & Hove Albion" },
  { id: "44444444-4444-4444-8444-444444444444", full_name: "David Button", current_club: "Ipswich Town" },
  { id: "55555555-5555-4555-8555-555555555555", full_name: "David Cornell", current_club: "Preston North End" },
];

const MENTORS = [
  { id: "22222222-2222-4222-8222-222222222222", name: "David Rouse" },
  { id: "66666666-6666-4666-8666-666666666666", name: "Alec Chamberlain" },
  { id: "77777777-7777-4777-8777-777777777777", name: "Dave Watson" },
];

const DEFAULT_MENTOR_ID = "22222222-2222-4222-8222-222222222222";

describe("fixture spreadsheet parsing", () => {
  it("maps common headers including Home/Away, Competition and Mentor", () => {
    const rows = parseFixtureMatrix([
      ["Date", "Time", "Goalkeeper", "Club", "Opponent", "Competition", "Venue", "H/A", "Mentor"],
      ["15/08/2026", "15:00", "James Beadle", "Charlton Athletic", "Leyton Orient", "League One", "The Valley", "H", "David Rouse"],
      ["", "", "", "", "", "", "", "", ""],
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rowNumber: 2,
      dateRaw: "15/08/2026",
      timeRaw: "15:00",
      goalkeeperRaw: "James Beadle",
      clubRaw: "Charlton Athletic",
      opponentRaw: "Leyton Orient",
      competitionRaw: "League One",
      venueRaw: "The Valley",
      homeAwayRaw: "H",
      mentorRaw: "David Rouse",
    });
  });

  it("parses CSV text the same way", () => {
    const rows = parseFixtureCsv(
      "Date,Goalkeeper,Opponent\n16/08/2026,Kjell Scherpen,Arsenal\n",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].goalkeeperRaw).toBe("Kjell Scherpen");
    expect(rows[0].opponentRaw).toBe("Arsenal");
  });

  it("parses a real .xlsx ArrayBuffer", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Date", "Goalkeeper", "Club", "Opponent", "Time"],
      ["2026-09-01", "James Beadle", "Charlton Athletic", "Portsmouth", "19:45"],
    ]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Fixtures");
    const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" }) as Uint8Array;
    const rows = parseFixtureWorkbook(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0].opponentRaw).toBe("Portsmouth");
    expect(rows[0].timeRaw).toBe("19:45");
  });

  it("rejects workbooks with unrecognised headers", () => {
    expect(() => parseFixtureMatrix([["Foo", "Bar"], ["1", "2"]])).toThrow(/recognise any fixture columns/i);
  });
});

describe("fixture field normalisation", () => {
  it("parses UK dates, ISO dates and Excel serials", () => {
    expect(parseFixtureDate("15/08/2026")).toBe("2026-08-15");
    expect(parseFixtureDate("2026-08-15")).toBe("2026-08-15");
    // Excel serial for 2026-08-15 using the 1899-12-30 epoch SheetJS uses.
    const excelSerial = String(
      Math.floor((Date.UTC(2026, 7, 15) - Date.UTC(1899, 11, 30)) / 86_400_000),
    );
    expect(parseFixtureDate(excelSerial)).toBe("2026-08-15");
    expect(parseFixtureDate("not-a-date")).toBeNull();
  });

  it("parses 24h, 12h and fractional Excel times", () => {
    expect(parseFixtureTime("15:00")).toBe("15:00");
    expect(parseFixtureTime("3:05 PM")).toBe("15:05");
    expect(parseFixtureTime("0.625")).toBe("15:00");
    expect(parseFixtureTime("")).toBeNull();
    expect(parseFixtureTime("", "15:00")).toBe("15:00");
  });

  it("normalises home/away markers", () => {
    expect(normalizeHomeAway("H")).toBe("H");
    expect(normalizeHomeAway("Away")).toBe("A");
    expect(normalizeHomeAway("maybe")).toBeNull();
  });
});

describe("mentor matching", () => {
  it("auto-accepts exact directory names and known nicknames", () => {
    expect(matchMentorName("David Rouse", MENTORS)).toMatchObject({
      status: "exact",
      mentorId: DEFAULT_MENTOR_ID,
      mentorName: "David Rouse",
    });
    expect(matchMentorName("Chambo", MENTORS)).toMatchObject({
      status: "exact",
      mentorId: "66666666-6666-4666-8666-666666666666",
      mentorName: "Alec Chamberlain",
    });
  });

  it("flags unmatched mentor names", () => {
    expect(matchMentorName("Nobody", MENTORS).status).toBe("unmatched");
  });
});

describe("goalkeeper matching", () => {
  it("auto-accepts a single exact match ignoring case and spacing", () => {
    const match = matchGoalkeeperName("  james   beadle ", ROSTER);
    expect(match.status).toBe("exact");
    expect(match.playerId).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("flags unmatched names without inventing a player", () => {
    const match = matchGoalkeeperName("Totally Unknown", ROSTER);
    expect(match.status).toBe("unmatched");
    expect(match.playerId).toBeNull();
  });

  it("flags ambiguous surname collisions rather than guessing", () => {
    const match = matchGoalkeeperName("David", ROSTER);
    expect(match.status).toBe("ambiguous");
    expect(match.playerId).toBeNull();
    expect(match.candidates.map((c) => c.id).sort()).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ]);
  });
});

describe("duplicate detection", () => {
  it("recognises an embedded fixture-key from a previous import", () => {
    const key = buildFixtureDuplicateKey({
      playerId: "11111111-1111-4111-8111-111111111111",
      eventDate: "2026-08-15",
      startTime: "15:00",
      club: "Charlton Athletic",
      opponent: "Leyton Orient",
      homeAway: "H",
    });
    const notes = embedFixtureDuplicateKey("Imported fixture\nOpponent: Leyton Orient", key);
    expect(extractFixtureDuplicateKey(notes)).toBe(key);

    const index = indexExistingFixtureKeys([
      {
        id: "evt-1",
        player_id: "11111111-1111-4111-8111-111111111111",
        event_date: "2026-08-15",
        start_time: "15:00:00",
        title: "Charlton Athletic v Leyton Orient",
        event_type: "Match",
        notes,
        location: null,
        status: "scheduled",
      },
    ]);
    expect(findDuplicateEventId(key, "Charlton Athletic v Leyton Orient", "11111111-1111-4111-8111-111111111111", "2026-08-15", "15:00", index)).toBe(
      "evt-1",
    );
  });

  it("ignores cancelled events when indexing duplicates", () => {
    const key = buildFixtureDuplicateKey({
      playerId: "11111111-1111-4111-8111-111111111111",
      eventDate: "2026-08-15",
      startTime: "15:00",
      club: "Charlton Athletic",
      opponent: "Leyton Orient",
      homeAway: "H",
    });
    const index = indexExistingFixtureKeys([
      {
        id: "evt-cancelled",
        player_id: "11111111-1111-4111-8111-111111111111",
        event_date: "2026-08-15",
        start_time: "15:00",
        title: "Charlton Athletic v Leyton Orient",
        event_type: "Match",
        notes: embedFixtureDuplicateKey("", key),
        location: null,
        status: "cancelled",
      },
    ]);
    expect(findDuplicateEventId(key, "x", "11111111-1111-4111-8111-111111111111", "2026-08-15", "15:00", index)).toBeNull();
  });
});

describe("prepareFixtureImport validation and summary", () => {
  it("marks exact matches ready and summarises blockers", () => {
    const { rows, summary } = prepareFixtureImport({
      rows: parseFixtureCsv(
        [
          "Date,Time,Goalkeeper,Club,Opponent,Competition,Venue,H/A",
          "15/08/2026,15:00,James Beadle,Charlton Athletic,Leyton Orient,League One,The Valley,H",
          "16/08/2026,15:00,Unknown Keeper,Somewhere,Else,League,Ground,H",
          "17/08/2026,,David,Ipswich Town,Leeds,Championship,Portman Road,H",
        ].join("\n"),
      ),
      roster: ROSTER,
      mentors: MENTORS,
      existingEvents: [],
      defaultStartTime: "15:00",
      defaultMentorId: DEFAULT_MENTOR_ID,
    });

    expect(rows[0].status).toBe("ready");
    expect(rows[0].eventDate).toBe("2026-08-15");
    expect(rows[0].title).toContain("Charlton Athletic v Leyton Orient");
    expect(rows[0].notes).toContain("fixture-key:");
    expect(rows[0].mentor.mentorId).toBe(DEFAULT_MENTOR_ID);
    expect(rows[0].mentor.status).toBe("default");

    expect(rows[1].status).toBe("needs_goalkeeper");
    expect(rows[2].goalkeeper.status).toBe("ambiguous");

    expect(summary).toMatchObject({
      total: 3,
      ready: 1,
      unmatchedGoalkeepers: 1,
      ambiguousGoalkeepers: 1,
    });
    expect(summariseFixtureImport(rows).validationErrors).toBeGreaterThan(0);
  });

  it("assigns different mentors per row from the Mentor column", () => {
    const { rows, summary } = prepareFixtureImport({
      rows: parseFixtureCsv(
        [
          "Date,Time,Goalkeeper,Club,Opponent,Mentor",
          "15/08/2026,15:00,James Beadle,Charlton Athletic,Leyton Orient,David Rouse",
          "16/08/2026,15:00,Kjell Scherpen,Brighton,Arsenal,Chambo",
          "17/08/2026,15:00,David Button,Ipswich Town,Leeds,Watto",
        ].join("\n"),
      ),
      roster: ROSTER,
      mentors: MENTORS,
      existingEvents: [],
    });

    expect(summary.ready).toBe(3);
    expect(rows.map((row) => row.mentor.mentorName)).toEqual([
      "David Rouse",
      "Alec Chamberlain",
      "Dave Watson",
    ]);
    expect(rows.every((row) => row.mentor.status === "exact")).toBe(true);
  });

  it("flags a second upload of the same fixture as duplicate", () => {
    const first = prepareFixtureImport({
      rows: parseFixtureCsv(
        "Date,Time,Goalkeeper,Club,Opponent\n15/08/2026,15:00,James Beadle,Charlton Athletic,Leyton Orient\n",
      ),
      roster: ROSTER,
      mentors: MENTORS,
      existingEvents: [],
      defaultMentorId: DEFAULT_MENTOR_ID,
    });
    expect(first.rows[0].status).toBe("ready");

    const second = prepareFixtureImport({
      rows: parseFixtureCsv(
        "Date,Time,Goalkeeper,Club,Opponent\n15/08/2026,15:00,James Beadle,Charlton Athletic,Leyton Orient\n",
      ),
      roster: ROSTER,
      mentors: MENTORS,
      existingEvents: [
        {
          id: "existing",
          player_id: "11111111-1111-4111-8111-111111111111",
          event_date: "2026-08-15",
          start_time: "15:00",
          title: first.rows[0].title,
          event_type: "Match",
          notes: first.rows[0].notes,
          location: first.rows[0].location,
          status: "scheduled",
        },
      ],
      defaultMentorId: DEFAULT_MENTOR_ID,
    });
    expect(second.rows[0].status).toBe("duplicate");
    expect(second.summary.duplicates).toBe(1);
    expect(second.summary.ready).toBe(0);
  });

  it("accepts a manual goalkeeper resolution before import", () => {
    const parsed = parseFixtureCsv(
      "Date,Time,Goalkeeper,Club,Opponent\n18/08/2026,12:30,Mystery GK,Club,Opponent FC\n",
    );
    const unresolved = prepareFixtureImport({
      rows: parsed,
      roster: ROSTER,
      mentors: MENTORS,
      existingEvents: [],
      defaultMentorId: DEFAULT_MENTOR_ID,
    });
    expect(unresolved.rows[0].status).toBe("needs_goalkeeper");

    const resolved = prepareFixtureImport({
      rows: parsed,
      roster: ROSTER,
      mentors: MENTORS,
      existingEvents: [],
      defaultMentorId: DEFAULT_MENTOR_ID,
      goalkeeperResolutions: { [parsed[0].rowNumber]: "33333333-3333-4333-8333-333333333333" },
    });
    expect(resolved.rows[0].status).toBe("ready");
    expect(resolved.rows[0].goalkeeper.playerId).toBe("33333333-3333-4333-8333-333333333333");
    expect(resolved.rows[0].goalkeeper.status).toBe("resolved");
  });

  it("maps a ready fixture onto the calendar event shape validateEvent accepts", async () => {
    const { validateEvent } = await import("@/lib/calendar.functions");
    const { rows } = prepareFixtureImport({
      rows: parseFixtureCsv(
        "Date,Time,Goalkeeper,Club,Opponent,Competition,Venue,H/A,Mentor\n15/08/2026,15:00,James Beadle,Charlton Athletic,Leyton Orient,League One,The Valley,H,David Rouse\n",
      ),
      roster: ROSTER,
      mentors: MENTORS,
      existingEvents: [],
    });
    expect(rows[0].status).toBe("ready");
    const payload = validateEvent({
      title: rows[0].title,
      event_type: "Match",
      event_date: rows[0].eventDate!,
      start_time: rows[0].startTime!,
      location: rows[0].location,
      notes: rows[0].notes,
      player_id: rows[0].goalkeeper.playerId!,
      assigned_mentor_id: rows[0].mentor.mentorId!,
    });
    expect(payload).toMatchObject({
      event_type: "Match",
      event_date: "2026-08-15",
      start_time: "15:00",
      player_id: "11111111-1111-4111-8111-111111111111",
      assigned_mentor_id: DEFAULT_MENTOR_ID,
      location: "The Valley",
    });
    expect(payload.notes).toContain("Opponent: Leyton Orient");
    expect(payload.notes).toContain("fixture-key:");
  });
});
