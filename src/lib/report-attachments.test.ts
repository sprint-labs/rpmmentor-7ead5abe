import { describe, it, expect } from "vitest";
import { attachmentLookupIds, mergeAttachments } from "./report-attachments";

const asset = (id: string) => ({ id });

describe("historical attachment preservation", () => {
  it("looks up both the current mr2_ id and the legacy mr_ id", () => {
    expect(attachmentLookupIds("mr2_abcd1234", "mr_abcd1234")).toEqual([
      "mr2_abcd1234",
      "mr_abcd1234",
    ]);
  });

  it("drops empty/duplicate ids (route id === resolved id)", () => {
    expect(attachmentLookupIds("mr2_a", "mr2_a", null, "", undefined)).toEqual(["mr2_a"]);
  });

  it("merges current and legacy attachment sets", () => {
    expect(mergeAttachments([asset("a")], [asset("b"), asset("c")]).map((a) => a.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("dedupes an asset attached under both identities", () => {
    expect(
      mergeAttachments([asset("a"), asset("b")], [asset("b"), asset("c")]).map((a) => a.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("returns legacy attachments when the new identity has none", () => {
    expect(mergeAttachments<{ id: string }>([], [asset("l1"), asset("l2")])).toHaveLength(2);
  });
});
