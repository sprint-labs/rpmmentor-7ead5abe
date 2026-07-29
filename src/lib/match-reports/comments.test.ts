import { describe, it, expect } from "vitest";
import {
  BLANK_COMMENTS_TEMPLATE,
  ensureSections,
  missingSections,
  meaningfulCharCount,
  validateComments,
  chooseInsertSection,
  sectionAtOffset,
  insertUnderSection,
} from "./comments";

const GOOD =
  "Summary:\nCalm on the ball and confident throughout the first half.\n\nKey Moments:\nStrong save at 34' and clean claim from a corner.\n\nDevelopment Focus:\nStart position for crosses.\n";

describe("ensureSections", () => {
  it("returns the blank template for empty input", () => {
    expect(ensureSections("")).toBe(BLANK_COMMENTS_TEMPLATE);
    expect(ensureSections("   \n ")).toBe(BLANK_COMMENTS_TEMPLATE);
  });

  it("keeps unstructured text verbatim under Summary and adds the rest", () => {
    const out = ensureSections("Great performance overall.");
    expect(out).toContain("Great performance overall.");
    expect(missingSections(out)).toEqual([]);
  });

  it("appends only the missing labels and loses nothing", () => {
    const out = ensureSections("Summary:\nSolid.\n\nKey Moments:\nSave at 20'.");
    expect(out).toContain("Solid.");
    expect(out).toContain("Save at 20'.");
    expect(missingSections(out)).toEqual([]);
  });

  it("is a no-op when all three labels exist", () => {
    expect(ensureSections(GOOD)).toBe(GOOD);
  });
});

describe("meaningfulCharCount", () => {
  it("excludes headings, colons and whitespace", () => {
    expect(meaningfulCharCount(BLANK_COMMENTS_TEMPLATE)).toBe(0);
  });
});

describe("validateComments", () => {
  it("accepts real notes", () => {
    expect(validateComments(GOOD).ok).toBe(true);
  });

  it("rejects labels only", () => {
    expect(validateComments(BLANK_COMMENTS_TEMPLATE).ok).toBe(false);
  });

  it("rejects score-only values", () => {
    for (const v of ["3", "4/5", "five"]) {
      expect(validateComments(`Summary:\n${v}\n\nKey Moments:\n\nDevelopment Focus:\n`).ok).toBe(false);
    }
  });

  it("rejects placeholder/testing text", () => {
    expect(validateComments("Summary:\ntest\n\nKey Moments:\ntesting\n\nDevelopment Focus:\ntbc\n").ok).toBe(false);
  });

  it("rejects plainly repeated paragraphs", () => {
    const repeated = "Summary:\nHe played well today.\n\nKey Moments:\nhe played WELL today.\n\nDevelopment Focus:\nHe played well today.\n";
    expect(validateComments(repeated).ok).toBe(false);
  });

  it("rejects short but distinct notes under 40 meaningful chars", () => {
    const short = "Summary:\nGood game.\n\nKey Moments:\nOne save.\n\nDevelopment Focus:\nKicking.\n";
    expect(validateComments(short).ok).toBe(false);
  });
});

describe("insertion targeting", () => {
  it("routes action keywords to Key Moments", () => {
    expect(chooseInsertSection("Good save at 30 minutes", null)).toBe("Key Moments");
  });

  it("routes general overview to Summary", () => {
    expect(chooseInsertSection("He looked confident and calm", null)).toBe("Summary");
  });

  it("respects a cursor explicitly in Development Focus", () => {
    expect(chooseInsertSection("Good save at 30 minutes", "Development Focus")).toBe("Development Focus");
  });

  it("resolves the section at a caret offset", () => {
    const idx = GOOD.indexOf("Start position");
    expect(sectionAtOffset(GOOD, idx + 3)).toBe("Development Focus");
  });

  it("appends under the chosen section without losing text", () => {
    const res = insertUnderSection(GOOD, "Punched clear under pressure.", "Key Moments");
    expect(res.text).toContain("Punched clear under pressure.");
    expect(res.text).toContain("Start position for crosses.");
    expect(res.text.indexOf("Punched clear")).toBeLessThan(res.text.indexOf("Development Focus:"));
    expect(res.selectionStart).toBeGreaterThan(0);
  });
});
