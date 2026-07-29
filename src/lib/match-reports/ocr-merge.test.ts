import { describe, expect, it } from "vitest";
import { mergeOcrText, ensureSections, BLANK_COMMENTS_TEMPLATE } from "./comments";

describe("handwritten OCR merge — user-controlled replace/append", () => {
  const EXISTING = ensureSections("Summary:\nCommanding display.\n\nKey Moments:\nSave at 20'.");

  it("replace swaps content but keeps the section structure", () => {
    const out = mergeOcrText(EXISTING, "Kept a clean sheet and organised the back four.", "replace");
    expect(out).not.toContain("Commanding display");
    expect(out).toContain("Summary:");
    expect(out).toContain("Key Moments:");
    expect(out).toContain("clean sheet");
  });

  it("append never deletes existing mentor text", () => {
    const out = mergeOcrText(EXISTING, "Extra note from the handwritten page.", "append");
    expect(out).toContain("Commanding display");
    expect(out).toContain("Save at 20'");
    expect(out).toContain("Extra note from the handwritten page.");
  });

  it("appending into empty comments seeds the template sections", () => {
    const out = mergeOcrText("", "First observation.", "append");
    expect(out).toContain("Summary:");
    expect(out).toContain("First observation.");
  });

  it("blank OCR output is a no-op", () => {
    expect(mergeOcrText(EXISTING, "   \n ", "replace")).toBe(EXISTING);
    expect(mergeOcrText(BLANK_COMMENTS_TEMPLATE, "", "append")).toBe(BLANK_COMMENTS_TEMPLATE);
  });
});
