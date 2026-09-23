import { describe, expect, it } from "vitest";

import {
  UNMATCHED_GROUP_KEY,
  describeMatchClips,
  filterGroupsByMatchDate,
  formatMatchDate,
  goalkeeperIdForMatch,
  groupClipsByMatch,
  isMissingMatchClipsSchema,
  isRecentMatch,
  matchLabel,
  matchesByDate,
  pickableMatches,
  resolveClipMatch,
  shiftDateOnly,
  weekOf,
  type MatchEventLike,
} from "@/lib/match-clips";
import type { MediaAsset } from "@/lib/media-store";

function match(overrides: Partial<MatchEventLike> = {}): MatchEventLike {
  return {
    id: "event-1",
    title: "Brighton v Fulham (U21 Premier League)",
    event_type: "Match",
    event_date: "2026-09-19",
    status: "scheduled",
    player_id: "player-beadle",
    goalkeeper_name: "James Beadle",
    ...overrides,
  };
}

let seq = 0;

function clip(overrides: Partial<MediaAsset> = {}): MediaAsset {
  seq += 1;
  return {
    id: `clip-${seq}`,
    gk_id: "player-beadle",
    title: `Clip ${seq}.mp4`,
    notes: null,
    media_type: "video",
    mime_type: "video/mp4",
    file_path: `player-beadle/${seq}.mp4`,
    file_size: 1024,
    thumbnail_path: null,
    rating_tags: [],
    uploaded_by_id: "user-1",
    uploaded_by_name: "David Rouse",
    uploaded_by_role: "mentor_manager",
    created_at: "2026-09-20T10:00:00.000Z",
    updated_at: "2026-09-20T10:00:00.000Z",
    asset_purpose: "match_clip",
    match_event_id: "event-1",
    upload_batch_id: "batch-1",
    ...overrides,
  };
}

describe("pickableMatches", () => {
  it("keeps played, uncancelled matches, newest first", () => {
    const events = [
      match({ id: "old", event_date: "2026-09-01" }),
      match({ id: "future", event_date: "2026-09-30" }),
      match({ id: "cancelled", event_date: "2026-09-18", status: "cancelled" }),
      match({ id: "visit", event_date: "2026-09-18", event_type: "Training Ground Visit" }),
      match({ id: "today", event_date: "2026-09-23" }),
      match({ id: "recent", event_date: "2026-09-19" }),
    ];
    expect(pickableMatches(events, "2026-09-23").map((event) => event.id)).toEqual([
      "today",
      "recent",
      "old",
    ]);
  });
});

describe("dates", () => {
  it("shifts calendar dates across a month boundary", () => {
    expect(shiftDateOnly("2026-10-03", 14)).toBe("2026-09-19");
  });

  it("treats the last fortnight as recent", () => {
    expect(isRecentMatch(match({ event_date: "2026-09-09" }), "2026-09-23")).toBe(true);
    expect(isRecentMatch(match({ event_date: "2026-09-08" }), "2026-09-23")).toBe(false);
  });

  it("formats the calendar date without shifting it by timezone", () => {
    expect(formatMatchDate("2026-09-19")).toBe("Sat 19 Sep 2026");
    expect(formatMatchDate("2026-10-04")).toBe("Sun 4 Oct 2026");
    expect(formatMatchDate("not-a-date")).toBe("not-a-date");
  });
});

describe("matchLabel", () => {
  it("names the date, fixture and goalkeeper", () => {
    expect(matchLabel(match())).toBe(
      "Sat 19 Sep 2026 · Brighton v Fulham (U21 Premier League) · James Beadle",
    );
  });

  it("does not repeat a goalkeeper the title already names", () => {
    const label = matchLabel(match({ title: "James Beadle — Brighton v Fulham" }));
    expect(label.match(/James Beadle/g)).toHaveLength(1);
  });
});

describe("goalkeeperIdForMatch", () => {
  const players = [{ id: "player-walton", full_name: "Christian Walton" }];

  it("uses the fixture's canonical player id", () => {
    expect(goalkeeperIdForMatch(match(), players)).toBe("player-beadle");
  });

  it("resolves a name-only event against the roster", () => {
    expect(
      goalkeeperIdForMatch(
        match({ player_id: null, goalkeeper_name: "Christian Walton" }),
        players,
      ),
    ).toBe("player-walton");
  });

  it("leaves the clip unlinked when nobody can be identified", () => {
    expect(
      goalkeeperIdForMatch(match({ player_id: null, goalkeeper_name: "Somebody Else" }), players),
    ).toBeNull();
    expect(goalkeeperIdForMatch(null, players)).toBeNull();
  });
});

describe("resolveClipMatch", () => {
  it("falls back to the batch match without an override", () => {
    expect(resolveClipMatch("batch-match", undefined)).toBe("batch-match");
  });

  it("lets one file choose a different match, or none", () => {
    expect(resolveClipMatch("batch-match", "other-match")).toBe("other-match");
    expect(resolveClipMatch("batch-match", null)).toBeNull();
  });
});

describe("groupClipsByMatch", () => {
  const events = new Map([
    ["event-1", match()],
    ["event-2", match({ id: "event-2", event_date: "2026-09-12" })],
  ]);

  it("groups by match, newest match first, unmatched last", () => {
    const groups = groupClipsByMatch(
      [
        clip({ id: "a", match_event_id: null }),
        clip({ id: "b", match_event_id: "event-2" }),
        clip({ id: "c", match_event_id: "event-1" }),
        clip({ id: "d", match_event_id: "event-1" }),
      ],
      events,
    );
    expect(groups.map((group) => group.key)).toEqual(["event-1", "event-2", UNMATCHED_GROUP_KEY]);
    expect(groups[0]!.clips.map((item) => item.id)).toEqual(["c", "d"]);
    expect(groups[2]!.event).toBeNull();
  });

  it("keeps footage whose match cannot be found", () => {
    const groups = groupClipsByMatch([clip({ id: "orphan", match_event_id: "gone" })], events);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "gone", event: null });
    expect(groups[0]!.clips[0]!.id).toBe("orphan");
  });
});

describe("filterGroupsByMatchDate", () => {
  const groups = groupClipsByMatch(
    [
      clip({ match_event_id: "event-1" }),
      clip({ match_event_id: "event-2" }),
      clip({ match_event_id: null }),
    ],
    new Map([
      ["event-1", match()],
      ["event-2", match({ id: "event-2", event_date: "2026-09-12" })],
    ]),
  );

  it("returns everything without a range", () => {
    expect(filterGroupsByMatchDate(groups, undefined, undefined)).toHaveLength(3);
  });

  it("filters on the match date, inclusive", () => {
    expect(
      filterGroupsByMatchDate(groups, "2026-09-12", "2026-09-12").map((group) => group.key),
    ).toEqual(["event-2"]);
    expect(filterGroupsByMatchDate(groups, "2026-09-13", undefined).map((g) => g.key)).toEqual([
      "event-1",
    ]);
  });
});

describe("describeMatchClips", () => {
  it("counts clips, matches and unmatched clips", () => {
    const groups = groupClipsByMatch(
      [clip(), clip(), clip({ match_event_id: null })],
      new Map([["event-1", match()]]),
    );
    expect(describeMatchClips(groups)).toBe("3 clips · 1 match · 1 unmatched");
  });

  it("says when there is nothing yet", () => {
    expect(describeMatchClips([])).toBe("No match clips yet.");
  });
});

describe("isMissingMatchClipsSchema", () => {
  it("recognises a read against a database without the new columns", () => {
    expect(isMissingMatchClipsSchema("column media_assets.asset_purpose does not exist")).toBe(
      true,
    );
    expect(isMissingMatchClipsSchema("JWT expired")).toBe(false);
    expect(isMissingMatchClipsSchema(null)).toBe(false);
  });
});

describe("weekOf", () => {
  it("returns the Monday-first week, across a month boundary", () => {
    expect(weekOf("2026-10-01")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(weekOf("2026-09-28")[0]).toBe("2026-09-28");
    expect(weekOf("2026-10-04")[0]).toBe("2026-09-28");
  });
});

describe("matchesByDate", () => {
  it("groups matches by day, alphabetical within a day", () => {
    const byDate = matchesByDate([
      match({ id: "b", title: "Oxford v Cambridge" }),
      match({ id: "a", title: "Blackpool v Plymouth" }),
      match({ id: "c", event_date: "2026-09-12" }),
    ]);
    expect(byDate.get("2026-09-19")!.map((event) => event.id)).toEqual(["a", "b"]);
    expect(byDate.get("2026-09-12")!.map((event) => event.id)).toEqual(["c"]);
  });
});
