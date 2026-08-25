import { describe, expect, it } from "vitest";
import { goalkeepers } from "./mock-data";
import { buildHighlightReelItems, HIGHLIGHT_RATING_TAG } from "./goalkeeper-highlight-reel";
import type { MediaAsset } from "./media-store";

function mediaStub(partial: Partial<MediaAsset> & Pick<MediaAsset, "id" | "title">): MediaAsset {
  return {
    gk_id: null,
    notes: null,
    media_type: "video",
    mime_type: "video/mp4",
    file_path: `videos/${partial.id}.mp4`,
    file_size: 1_024,
    thumbnail_path: null,
    rating_tags: [],
    uploaded_by_id: null,
    uploaded_by_name: null,
    uploaded_by_role: null,
    created_at: "2026-08-25T00:00:00.000Z",
    updated_at: "2026-08-25T00:00:00.000Z",
    ...partial,
  };
}

describe("goalkeeper highlight reels and core metrics", () => {
  it("gives every goalkeeper a reserved highlight-reel slot", () => {
    expect(goalkeepers.length).toBeGreaterThan(10);
    for (const gk of goalkeepers) {
      expect(gk.videoLinks).toEqual([]);
      expect(gk).toHaveProperty("shirtNumber");
    }
  });

  it("only carries height and foot in a recorded shape, never a generated one", () => {
    for (const gk of goalkeepers) {
      expect(gk.videoLinks.some((url) => url.includes("video.rpmgk.com"))).toBe(false);
      // Blank stays blank; a present value must look like a real master-sheet fact.
      if (gk.height !== null) expect(gk.height).toMatch(/^1[89]\d cm$|^20[01] cm$/);
      if (gk.foot !== null) expect(["Right", "Left"]).toContain(gk.foot);
      if (gk.shirtNumber !== null) {
        expect(Number.isInteger(gk.shirtNumber)).toBe(true);
        expect(gk.shirtNumber).toBeGreaterThan(0);
      }
    }
  });

  it("leaves height and foot blank when the master sheet has no value", () => {
    // Sheet has no height/foot for these academy keepers; the profile must not invent one.
    for (const name of ["Owen Grainger", "Xander Grieves", "Blake Irow", "Jack Talbot"]) {
      const gk = goalkeepers.find((g) => g.name === name);
      expect(gk, name).toBeTruthy();
      expect(gk!.height, name).toBeNull();
      expect(gk!.foot, name).toBeNull();
    }
  });

  it("shirt number stays blank until an authoritative source provides it", () => {
    // The master sheet has no shirt-number column; Beadle's is owner-supplied.
    const withShirt = goalkeepers.filter((gk) => gk.shirtNumber !== null).map((gk) => gk.name);
    expect(withShirt).toEqual(["James Beadle"]);
  });

  it("keeps James Beadle master-sheet profile facts", () => {
    const beadle = goalkeepers.find((gk) => gk.name === "James Beadle");
    expect(beadle).toBeTruthy();
    expect(beadle!.height).toBe("201 cm");
    expect(beadle!.shirtNumber).toBe(1);
    expect(beadle!.foot).toBe("Right");
    expect(beadle!.profileImage).toContain("premierleague.com");
  });

  it("includes Calum Ward on the QPR Championship roster", () => {
    const ward = goalkeepers.find((gk) => gk.name === "Calum Ward");
    expect(ward).toBeTruthy();
    expect(ward!.id).toBe("gk-calum-ward");
    expect(ward!.club).toBe("Queens Park Rangers");
    expect(ward!.league).toBe("EFL Championship");
    expect(ward!.parentClub).toBe("Queens Park Rangers");
    expect(ward!.onLoan).toBe(false);
    expect(ward!.nationality).toBe("England");
    expect(ward!.dob).toBe("2000-10-17");
  });

  it("surfaces Highlight-tagged media ahead of an empty videoLinks slot", () => {
    const items = buildHighlightReelItems(
      [],
      [
        mediaStub({
          id: "m1",
          title: "James Beadle highlight reel",
          rating_tags: [HIGHLIGHT_RATING_TAG],
        }),
        mediaStub({
          id: "m2",
          title: "Training clip",
          rating_tags: ["Coaching point"],
        }),
      ],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "asset",
      label: "James Beadle highlight reel",
    });
  });

  it("keeps external videoLinks and appends Highlight-tagged media", () => {
    const items = buildHighlightReelItems(
      ["https://example.com/highlights/main-reel"],
      [
        mediaStub({
          id: "m3",
          title: "Extra clip",
          rating_tags: [HIGHLIGHT_RATING_TAG],
        }),
      ],
    );
    expect(items.map((item) => item.label)).toEqual(["Main Reel", "Extra clip"]);
  });
});
