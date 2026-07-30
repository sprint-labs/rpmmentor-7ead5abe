import { describe, expect, it } from "vitest";
import { mergeOcrText } from "./comments";

describe("handwritten OCR merge — user-controlled replace/append", () => {
  const EXISTING = "Commanding display with a strong save at 20 minutes.";

  it("replace swaps content without adding section labels", () => {
    const out = mergeOcrText(EXISTING, "Kept a clean sheet and organised the back four.", "replace");
    expect(out).not.toContain("Commanding display");
    expect(out).not.toContain("Summary:");
    expect(out).toContain("clean sheet");
  });

  it("append never deletes existing mentor text", () => {
    const out = mergeOcrText(EXISTING, "Extra note from the handwritten page.", "append");
    expect(out).toContain("Commanding display");
    expect(out).toContain("save at 20 minutes");
    expect(out).toContain("Extra note from the handwritten page.");
  });

  it("appending into empty comments keeps the text free-form", () => {
    const out = mergeOcrText("", "First observation.", "append");
    expect(out).toBe("First observation.");
  });

  it("blank OCR output is a no-op", () => {
    expect(mergeOcrText(EXISTING, "   \n ", "replace")).toBe(EXISTING);
    expect(mergeOcrText("", "", "append")).toBe("");
  });
});
