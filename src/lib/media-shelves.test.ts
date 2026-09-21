import { describe, expect, it } from "vitest";

import {
  RECENT_SHELF_LIMIT,
  aliasesForGkId,
  buildGoalkeeperIdentities,
  buildMediaShelves,
  canonicalGkId,
  countMediaKinds,
  describeLibrary,
  resolveGoalkeeper,
  type GoalkeeperInfo,
} from "@/lib/media-shelves";
import { legacyGkSlugForName } from "@/lib/goalkeeper-player-link";
import type { MediaAsset, MediaKind } from "@/lib/media-store";

const ROSTER = new Map<string, GoalkeeperInfo>([
  ["gk-zoe", { name: "Zoe Keeper", club: "Northern FC" }],
  ["gk-alex", { name: "Alex Goalkeeper", club: "Southern United" }],
  ["gk-clubless", { name: "Sam Nomad", club: null }],
]);

let seq = 0;

function asset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  seq += 1;
  return {
    id: `asset-${seq}`,
    gk_id: null,
    title: `Asset ${seq}`,
    notes: null,
    media_type: "video",
    mime_type: "video/mp4",
    file_path: `media/${seq}.mp4`,
    file_size: 1024,
    thumbnail_path: null,
    rating_tags: [],
    uploaded_by_id: "user-1",
    uploaded_by_name: "David Rouse",
    uploaded_by_role: "mentor",
    created_at: "2026-09-18T10:00:00.000Z",
    updated_at: "2026-09-18T10:00:00.000Z",
    ...overrides,
  };
}

describe("resolveGoalkeeper", () => {
  it("prefers the live roster", () => {
    expect(resolveGoalkeeper("gk-zoe", ROSTER)).toEqual({
      name: "Zoe Keeper",
      club: "Northern FC",
    });
  });

  it("falls back to a placeholder for an id nothing knows about", () => {
    expect(resolveGoalkeeper("gk-missing", ROSTER)).toEqual({
      name: "Unknown goalkeeper",
      club: null,
    });
  });
});

describe("buildMediaShelves", () => {
  it("has no shelves at all for an empty library", () => {
    expect(buildMediaShelves([], ROSTER)).toEqual([]);
  });

  it("puts Recently added first, goalkeepers alphabetically, Unlinked last", () => {
    const shelves = buildMediaShelves(
      [
        asset({ gk_id: "gk-zoe" }),
        asset({ gk_id: null }),
        asset({ gk_id: "gk-alex" }),
        asset({ gk_id: "gk-zoe" }),
      ],
      ROSTER,
    );

    expect(shelves.map((s) => s.title)).toEqual([
      "Recently added",
      "Alex Goalkeeper",
      "Zoe Keeper",
      "Unlinked",
    ]);
    expect(shelves.map((s) => s.items.length)).toEqual([4, 1, 2, 1]);
  });

  it("prints the club beside the goalkeeper and marks the unlinked shelf", () => {
    const shelves = buildMediaShelves([asset({ gk_id: "gk-zoe" }), asset()], ROSTER);
    const zoe = shelves.find((s) => s.title === "Zoe Keeper");
    const unlinked = shelves.find((s) => s.unlinked);

    expect(zoe?.subtitle).toBe("Northern FC");
    expect(zoe?.gkId).toBe("gk-zoe");
    expect(unlinked?.subtitle).toBe("no goalkeeper on record");
    expect(unlinked?.gkId).toBeNull();
  });

  it("omits the Unlinked shelf when every asset is linked", () => {
    const shelves = buildMediaShelves([asset({ gk_id: "gk-alex" })], ROSTER);
    expect(shelves.some((s) => s.unlinked)).toBe(false);
  });

  it("caps Recently added but leaves the goalkeeper shelves whole", () => {
    const many = Array.from({ length: RECENT_SHELF_LIMIT + 4 }, () => asset({ gk_id: "gk-alex" }));
    const shelves = buildMediaShelves(many, ROSTER);

    expect(shelves[0].items).toHaveLength(RECENT_SHELF_LIMIT);
    expect(shelves[1].items).toHaveLength(RECENT_SHELF_LIMIT + 4);
  });

  it("keeps the incoming newest-first order inside each shelf", () => {
    const newest = asset({ gk_id: "gk-alex", created_at: "2026-09-19T00:00:00.000Z" });
    const oldest = asset({ gk_id: "gk-alex", created_at: "2026-08-01T00:00:00.000Z" });
    const shelves = buildMediaShelves([newest, oldest], ROSTER);

    expect(shelves[1].items.map((i) => i.id)).toEqual([newest.id, oldest.id]);
  });

  it("only repeats the goalkeeper name on the Recently added tiles", () => {
    const shelves = buildMediaShelves([asset({ gk_id: "gk-alex" }), asset()], ROSTER);
    expect(shelves.map((s) => s.showsGoalkeeperOnTile)).toEqual([true, false, false]);
  });
});

describe("countMediaKinds", () => {
  it("counts every type plus the total", () => {
    const kinds: MediaKind[] = ["video", "video", "audio", "pdf"];
    expect(countMediaKinds(kinds.map((media_type) => asset({ media_type })))).toEqual({
      all: 4,
      video: 2,
      audio: 1,
      pdf: 1,
      image: 0,
    });
  });
});

describe("describeLibrary", () => {
  it("counts distinct goalkeepers, not assets", () => {
    expect(
      describeLibrary([
        asset({ gk_id: "gk-alex" }),
        asset({ gk_id: "gk-alex" }),
        asset({ gk_id: "gk-zoe" }),
        asset(),
      ]),
    ).toBe("4 assets · 2 goalkeepers · 1 unlinked");
  });

  it("leaves the unlinked clause out when there is nothing unlinked", () => {
    expect(describeLibrary([asset({ gk_id: "gk-alex" })])).toBe("1 asset · 1 goalkeeper");
  });
});

/**
 * `media_assets.gk_id` has never held one value per goalkeeper. The column
 * comment set by `20260820122905_allow_unlinked_media_assets.sql` says so:
 * "New explicit links use canonical `public.players.id`; historical rows may
 * contain legacy `gk-*` slugs." Both forms are live in production.
 *
 * Grouping on the raw value split one goalkeeper into two shelves, counted
 * them as two goalkeepers, and left "View all" fetching only half the footage.
 */
describe("a goalkeeper linked by both their UUID and their legacy slug", () => {
  const PLAYER_ID = "3f1a9c2e-0000-4000-8000-000000000001";
  const SLUG = legacyGkSlugForName("Zoe Keeper");
  const IDENTITIES = buildGoalkeeperIdentities([
    { id: PLAYER_ID, full_name: "Zoe Keeper", current_club: "Northern FC" },
  ]);

  const BOTH_FORMS = [asset({ gk_id: PLAYER_ID }), asset({ gk_id: SLUG })];

  it("indexes the roster under both ids", () => {
    expect(SLUG).toBe("gk-zoe-keeper");
    expect(IDENTITIES.get(PLAYER_ID)?.name).toBe("Zoe Keeper");
    expect(IDENTITIES.get(SLUG)?.name).toBe("Zoe Keeper");
    // The same identity object, not two that happen to agree.
    expect(IDENTITIES.get(SLUG)).toBe(IDENTITIES.get(PLAYER_ID));
  });

  it("collapses both ids onto one canonical id", () => {
    expect(canonicalGkId(SLUG, IDENTITIES)).toBe(PLAYER_ID);
    expect(canonicalGkId(PLAYER_ID, IDENTITIES)).toBe(PLAYER_ID);
  });

  it("gets one shelf holding all of their media, not two holding half each", () => {
    const shelves = buildMediaShelves(BOTH_FORMS, IDENTITIES);
    const goalkeeperShelves = shelves.filter((shelf) => shelf.gkId !== null);
    expect(goalkeeperShelves).toHaveLength(1);
    expect(goalkeeperShelves[0].title).toBe("Zoe Keeper");
    expect(goalkeeperShelves[0].items).toHaveLength(2);
  });

  it("carries both ids on the shelf so View all fetches all of it", () => {
    const shelf = buildMediaShelves(BOTH_FORMS, IDENTITIES).find((s) => s.gkId !== null)!;
    expect([...shelf.gkIds].sort()).toEqual([PLAYER_ID, SLUG].sort());
    expect([...aliasesForGkId(SLUG, IDENTITIES)].sort()).toEqual([PLAYER_ID, SLUG].sort());
  });

  it("is counted as one goalkeeper in the library summary", () => {
    expect(describeLibrary(BOTH_FORMS, IDENTITIES)).toContain("1 goalkeeper");
    // Without the roster there is nothing to collapse against, so the old
    // double-count is what an unaliased call still yields — which is exactly
    // why the page now passes its roster in.
    expect(describeLibrary(BOTH_FORMS)).toContain("2 goalkeepers");
  });

  it("leaves a gk_id the roster has never seen on its own shelf", () => {
    const orphan = asset({ gk_id: "gk-not-on-the-roster" });
    const shelves = buildMediaShelves([orphan], IDENTITIES);
    const shelf = shelves.find((s) => s.gkId !== null)!;
    expect(shelf.gkId).toBe("gk-not-on-the-roster");
    expect(shelf.gkIds).toEqual(["gk-not-on-the-roster"]);
  });
});
