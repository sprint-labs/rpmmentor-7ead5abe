import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  formatRatio,
  gradeContrast,
  parseHexColor,
  relativeLuminance,
} from "./contrast";

describe("parseHexColor", () => {
  it("parses 6-digit hex with or without leading #", () => {
    expect(parseHexColor("#38FF5A")).toEqual([56, 255, 90]);
    expect(parseHexColor("0d9500")).toEqual([13, 149, 0]);
  });

  it("parses 3-digit shorthand", () => {
    expect(parseHexColor("#0f0")).toEqual([0, 255, 0]);
  });

  it("rejects non-hex values (e.g. unresolved color-mix tokens)", () => {
    expect(parseHexColor("")).toBeNull();
    expect(parseHexColor("color-mix(in oklab, #0D9500 12%, transparent)")).toBeNull();
    expect(parseHexColor("rgb(56, 255, 90)")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("anchors at black 0 and white 1", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white and symmetric", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 2);
  });

  it("returns null when either side is unparseable", () => {
    expect(contrastRatio("", "#FFFFFF")).toBeNull();
    expect(contrastRatio("#000000", "var(--background)")).toBeNull();
  });
});

describe("gradeContrast — the proposal's own token pairs", () => {
  it("dark volt on carbon passes text AAA and non-text", () => {
    const grade = gradeContrast("#38FF5A", "#0D0D0D");
    expect(grade).not.toBeNull();
    expect(grade!.ratio).toBeGreaterThan(7);
    expect(grade!.text).toBe("AAA");
    expect(grade!.nonText).toBe("pass");
  });

  it("light ink on paper passes AA text", () => {
    const grade = gradeContrast("#087A00", "#F7F6F2");
    expect(grade!.ratio).toBeGreaterThanOrEqual(4.5);
    expect(grade!.text).toBe("AA");
  });

  it("light volt on paper passes the 3:1 non-text bar but not text AA", () => {
    const grade = gradeContrast("#0D9500", "#F7F6F2");
    expect(grade!.nonText).toBe("pass");
    expect(grade!.text).toBe("AA-large");
  });

  it("the legacy light ring (#12C400) fails the non-text bar — why volt exists", () => {
    const grade = gradeContrast("#12C400", "#F7F6F2");
    expect(grade!.nonText).toBe("fail");
  });
});

describe("formatRatio", () => {
  it("renders two decimals with the :1 suffix", () => {
    expect(formatRatio(4.5)).toBe("4.50:1");
    expect(formatRatio(21)).toBe("21.00:1");
    expect(formatRatio(5.1234)).toBe("5.12:1");
  });
});
