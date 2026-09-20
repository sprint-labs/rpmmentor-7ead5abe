import { describe, it, expect } from "vitest";
import { scoreTone } from "@/lib/score-band";

describe("scoreTone", () => {
  it("bands at the boundaries the owner set", () => {
    expect(scoreTone(5).band).toBe("high");
    expect(scoreTone(4).band).toBe("high");
    expect(scoreTone(3.99).band).toBe("good");
    expect(scoreTone(3).band).toBe("good");
    expect(scoreTone(2.99).band).toBe("fair");
    expect(scoreTone(2).band).toBe("fair");
    expect(scoreTone(1.99).band).toBe("low");
    expect(scoreTone(1).band).toBe("low");
    expect(scoreTone(0).band).toBe("low");
  });

  it("bands the live figures from the profile that prompted this", () => {
    // James Beadle's last-5 averages: three of these sat in different bands
    // while all rendering the same green.
    expect(scoreTone(4.4).band).toBe("high");
    expect(scoreTone(4.2).band).toBe("high");
    expect(scoreTone(4.0).band).toBe("high");
    expect(scoreTone(3.8).band).toBe("good");
    expect(scoreTone(3.4).band).toBe("good");
  });

  it("keeps a missing score neutral rather than painting it as a bad one", () => {
    for (const absent of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const tone = scoreTone(absent);
      expect(tone.band).toBe("unknown");
      expect(tone.ink).not.toContain("destructive");
      expect(tone.bar).not.toContain("destructive");
    }
  });

  it("uses the design system's own rating ramp rather than a second one", () => {
    // The ramp already existed in styles.css for every theme. Two of its
    // values were not text-safe and were fixed when this shipped; the contrast
    // test holds all four to AA from here on.
    for (const value of [4.5, 3.5, 2.5, 1.5]) {
      const tone = scoreTone(value);
      expect(tone.bar).toMatch(/^bg-rating-/);
      expect(tone.ink).toMatch(/^text-rating-/);
    }
  });

  it("gives every band a distinct pairing", () => {
    const bands = [5, 3.5, 2.5, 1].map((v) => scoreTone(v));
    expect(new Set(bands.map((b) => b.bar)).size).toBe(4);
    expect(new Set(bands.map((b) => b.ink)).size).toBe(4);
  });
});
