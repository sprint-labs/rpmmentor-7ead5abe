import { describe, expect, it } from "vitest";
import { SCORE_SCALE, averageMeaning, scoreMeaning } from "./schema";
import { scoreTone } from "@/lib/score-band";

/**
 * RPM's rating system, word for word as RPM set it. Written out here rather
 * than read back from `SCORE_SCALE`, so a change to the wording fails this
 * test instead of quietly passing it.
 */
const RPM_RATING_SYSTEM = [
  [5, "Performing above current level"],
  [4, "Performing at top of current level"],
  [3, "Performing at current level"],
  [2, "Performing below current level"],
  [1, "Cause for concern"],
] as const;

describe("SCORE_SCALE", () => {
  it("is RPM's rating system, word for word, highest first", () => {
    expect(SCORE_SCALE.map(({ score, meaning }) => [score, meaning])).toEqual(RPM_RATING_SYSTEM);
  });

  it("gives every whole score from 1 to 5 its meaning and nothing else one", () => {
    for (const [score, meaning] of RPM_RATING_SYSTEM) expect(scoreMeaning(score)).toBe(meaning);
    expect(scoreMeaning(0)).toBeNull();
    expect(scoreMeaning(6)).toBeNull();
    expect(scoreMeaning(3.5)).toBeNull();
    expect(scoreMeaning(null)).toBeNull();
  });
});

describe("averageMeaning", () => {
  it("only reaches the next meaning once the average gets there", () => {
    expect(averageMeaning(3.9)).toBe("Performing at current level");
    expect(averageMeaning(4)).toBe("Performing at top of current level");
    expect(averageMeaning(4.9)).toBe("Performing at top of current level");
    expect(averageMeaning(5)).toBe("Performing above current level");
    expect(averageMeaning(1)).toBe("Cause for concern");
    expect(averageMeaning(1.9)).toBe("Cause for concern");
  });

  it("has no meaning for a missing or unreadable average", () => {
    expect(averageMeaning(null)).toBeNull();
    expect(averageMeaning(undefined)).toBeNull();
    expect(averageMeaning(Number.NaN)).toBeNull();
  });

  it("steps at the same whole numbers as the colour ramp, so words and colour agree", () => {
    for (const whole of [1, 2, 3, 4]) {
      expect(averageMeaning(whole + 0.9)).toBe(averageMeaning(whole));
      expect(scoreTone(whole + 0.9).band).toBe(scoreTone(whole).band);
    }
  });
});
