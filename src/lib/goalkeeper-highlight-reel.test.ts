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

  it("does not present generated or invented profile data as recorded facts", () => {
    for (const gk of goalkeepers) {
      expect(gk.height).toBeNull();
      expect(gk.shirtNumber).toBeNull();
      expect(gk.foot).toBeNull();
      expect(gk.videoLinks.some((url) => url.includes("video.rpmgk.com"))).toBe(false);
    }
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
