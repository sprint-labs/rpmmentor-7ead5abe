import { describe, it, expect } from "vitest";
import { isScoreOnly, validateComments } from "./comments";

const wrap = (body: string) =>
  `Summary:\n${body}\n\nKey Moments:\n\nDevelopment Focus:\n`;

describe("score-only comments are blocked deterministically", () => {
  const scoreOnly = [
    "3",
    "4/5",
    "five",
    "3 4 5 4 3 4 5 4 3 4 5 4 3 4 5 4 3 4 5 4 3 4 5 4",
    "4/5, 4/5, 3/5, 5/5, 4/5, 3/5, 4/5, 5/5, 3/5, 4/5",
    "three. four. five. four. three. four. five. four. three.",
    "4 / 5 — 3 / 5 — 5 / 5 — 4 / 5 — 3 / 5 — 4 / 5 — 5 / 5",
    "5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5\n5",
  ];
  for (const s of scoreOnly) {
    it(`rejects ${JSON.stringify(s.slice(0, 30))}`, () => {
      expect(isScoreOnly(s)).toBe(true);
      const res = validateComments(wrap(s));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toMatch(/only scores/i);
    });
  }

  it("rejects a 40+ character all-score string that would otherwise pass length", () => {
    const body = "4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5 4/5";
    expect(body.replace(/\s+/g, "").length).toBeGreaterThan(40);
    expect(validateComments(wrap(body)).ok).toBe(false);
  });
});

describe("real observations containing scores still pass", () => {
  const good = [
    "Handling was 4/5 today; two strong low saves in the first half and calm claims from crosses.",
    "Gave him a 3 for distribution — short passing under pressure broke down twice in the second half.",
    "Five clean claims from corners, brave in the one-on-one just before the break, communication improving.",
  ];
  for (const g of good) {
    it(`accepts ${JSON.stringify(g.slice(0, 30))}`, () => {
      expect(isScoreOnly(g)).toBe(false);
      expect(validateComments(wrap(g)).ok).toBe(true);
    });
  }
});
