import { describe, it, expect } from "vitest";
import {
  normaliseKeyPart,
  submissionFingerprint,
  classifyDuplicateWindow,
  newSubmissionKey,
} from "./duplicates";

describe("normaliseKeyPart", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normaliseKeyPart("  Blackburn   Rovers ")).toBe("blackburn rovers");
    expect(normaliseKeyPart(null)).toBe("");
  });
});

describe("submissionFingerprint", () => {
  it("is stable across casing and spacing", () => {
    const a = submissionFingerprint({
      goalkeeper: "Sam Beadle",
      team: "Wigan",
      opponent: "Blackburn",
      match_date: "2026-01-04",
    });
    const b = submissionFingerprint({
      goalkeeper: " sam  BEADLE ",
      team: "wigan ",
      opponent: " blackburn",
      match_date: "2026-01-04",
    });
    expect(a).toBe(b);
  });

  it("differs when team differs (cache report_id would collide)", () => {
    const a = submissionFingerprint({
      goalkeeper: "Sam Beadle",
      team: "Wigan",
      opponent: "Blackburn",
      match_date: "2026-01-04",
    });
    const b = submissionFingerprint({
      goalkeeper: "Sam Beadle",
      team: "Bolton",
      opponent: "Blackburn",
      match_date: "2026-01-04",
    });
    expect(a).not.toBe(b);
  });
});

describe("classifyDuplicateWindow", () => {
  const now = Date.parse("2026-01-04T12:00:00.000Z");

  it("flags a submit inside 10 minutes as strong", () => {
    expect(classifyDuplicateWindow(Date.parse("2026-01-04T11:55:00.000Z"), now)).toBe("strong");
  });

  it("flags a submit inside 24 hours as soft", () => {
    expect(classifyDuplicateWindow(Date.parse("2026-01-03T18:00:00.000Z"), now)).toBe("soft");
  });

  it("does not flag older submissions", () => {
    expect(classifyDuplicateWindow(Date.parse("2026-01-01T12:00:00.000Z"), now)).toBeNull();
  });

  it("ignores unusable timestamps (legacy sheet rows have no true submit time)", () => {
    expect(classifyDuplicateWindow(Number.NaN, now)).toBeNull();
  });
});

describe("newSubmissionKey", () => {
  it("returns unique keys", () => {
    expect(newSubmissionKey()).not.toBe(newSubmissionKey());
  });
});
