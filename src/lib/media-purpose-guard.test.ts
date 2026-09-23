/**
 * Only the Match Clips uploader may classify media as a Match Clip.
 *
 * Match Report voice notes, Interaction recordings, announcement attachments
 * and Media Library uploads all go through `uploadMedia` too. None of them may
 * send the Match Clips fields, so every one of them keeps landing as `general`
 * — the column default — exactly as it did before Match Clips existed. A
 * review can miss a new call site; this cannot.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve("src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) return [];
    return [path];
  });
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: relative(resolve("."), path),
  source: readFileSync(path, "utf8"),
}));

function filesMatching(pattern: RegExp): string[] {
  return FILES.filter((file) => pattern.test(file.source))
    .map((file) => file.path)
    .sort();
}

describe("Match Clip classification", () => {
  it("is requested by the Match Clips uploader and nothing else", () => {
    expect(filesMatching(/\bmatchClip\s*:/)).toEqual([
      "src/components/match-clips/match-clip-upload-form.tsx",
    ]);
  });

  it("is written to the database in one place only", () => {
    expect(filesMatching(/\bMATCH_CLIP_PURPOSE\b/)).toEqual(["src/lib/media-store.ts"]);
    expect(filesMatching(/["']match_clip["']/)).toEqual(["src/lib/media-store.ts"]);
    // `types.ts` declares the column; `media-store.ts` is the only insert.
    expect(filesMatching(/\basset_purpose\s*:/)).toEqual([
      "src/integrations/supabase/types.ts",
      "src/lib/media-store.ts",
    ]);
  });
});
