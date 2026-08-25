import type { MediaAsset } from "@/lib/media-store";

/** Tag used on Media uploads that should surface in the profile Highlight Reel. */
export const HIGHLIGHT_RATING_TAG = "Highlight";

export type HighlightReelLink = {
  kind: "link";
  id: string;
  url: string;
  label: string;
};

export type HighlightReelAsset = {
  kind: "asset";
  id: string;
  asset: MediaAsset;
  label: string;
};

export type HighlightReelItem = HighlightReelLink | HighlightReelAsset;

function reelLabelFromUrl(url: string, index: number): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    const slug = path.split("/").filter(Boolean).pop() ?? "";
    if (!slug || slug === "highlights") return index === 0 ? "Main highlight reel" : `Clip ${index + 1}`;
    return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return index === 0 ? "Main highlight reel" : `Clip ${index + 1}`;
  }
}

/**
 * Build the Highlight Reel list for a goalkeeper profile.
 * External `videoLinks` come first; Media rows tagged "Highlight" follow.
 */
export function buildHighlightReelItems(
  videoLinks: string[],
  media: MediaAsset[],
): HighlightReelItem[] {
  const links: HighlightReelItem[] = videoLinks
    .filter((url) => typeof url === "string" && url.trim().length > 0)
    .map((url, index) => ({
      kind: "link" as const,
      id: `link:${url}`,
      url,
      label: reelLabelFromUrl(url, index),
    }));

  const tagged = media
    .filter((asset) => (asset.rating_tags ?? []).includes(HIGHLIGHT_RATING_TAG))
    .map((asset, index) => ({
      kind: "asset" as const,
      id: `asset:${asset.id}`,
      asset,
      label: asset.title?.trim() || (index === 0 ? "Main highlight reel" : `Clip ${index + 1}`),
    }));

  return [...links, ...tagged];
}
