import { describe, it, expect } from "vitest";
import { mergeAttachments } from "./media-store";

const asset = (id: string) => ({ id, title: id }) as never;

describe("historical attachment preservation", () => {
  it("merges current (mr2_) and legacy (mr_) attachment sets", () => {
    const current = [asset("a")];
    const legacy = [asset("b"), asset("c")];
    expect(mergeAttachments(current, legacy).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("dedupes an asset attached under both identities", () => {
    const current = [asset("a"), asset("b")];
    const legacy = [asset("b"), asset("c")];
    expect(mergeAttachments(current, legacy).map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("returns legacy attachments when the new identity has none", () => {
    expect(mergeAttachments([], [asset("legacy-1"), asset("legacy-2")])).toHaveLength(2);
  });
});
