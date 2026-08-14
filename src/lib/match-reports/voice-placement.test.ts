import { describe, expect, it } from "vitest";
import {
  resolveInsertPlacement,
  insertAtOffset,
  insertUnderSection,
  sectionAtOffset,
  BLANK_COMMENTS_TEMPLATE,
  validateComments,
} from "./comments";

describe("voice transcript placement", () => {
  it("action incidents go to Key Moments", () => {
    expect(resolveInsertPlacement("Great save from the corner", null, 12)).toEqual({
      kind: "section",
      section: "Key Moments",
    });
  });

  it("clear overview wording goes to Summary", () => {
    expect(resolveInsertPlacement("Overall a confident, composed display", null, null)).toEqual({
      kind: "section",
      section: "Summary",
    });
  });

  it("Development Focus is only used when the caret is there", () => {
    expect(resolveInsertPlacement("work on it next week", "Development Focus", 40)).toEqual({
      kind: "section",
      section: "Development Focus",
    });
    expect(resolveInsertPlacement("work on it next week", null, null)).toEqual({
      kind: "section",
      section: "Key Moments",
    });
  });

  it("uncertain text with a caret inserts at the caret", () => {
    expect(resolveInsertPlacement("hmm nothing much", "Summary", 9)).toEqual({
      kind: "cursor",
      offset: 9,
    });
  });

  it("uncertain text with no caret appends under Key Moments", () => {
    expect(resolveInsertPlacement("hmm nothing much", null, null)).toEqual({
      kind: "section",
      section: "Key Moments",
    });
  });
});

describe("insertAtOffset", () => {
  const text = "Summary:\nHe was steady.\n\nKey Moments:\n\nDevelopment Focus:\n";
  it("preserves existing text and returns the caret after the snippet", () => {
    const at = text.indexOf("He was steady.") + "He was steady.".length;
    const res = insertAtOffset(text, "Held the line well.", at);
    expect(res.text).toContain("He was steady. Held the line well.");
    expect(res.text).toContain("Development Focus:");
    expect(res.text.slice(0, res.selectionStart).endsWith("Held the line well.")).toBe(true);
    expect(sectionAtOffset(res.text, res.selectionStart)).toBe("Summary");
  });
  it("never drops the rest of the comments", () => {
    const res = insertAtOffset(text, "x", 0);
    expect(res.text).toContain("He was steady.");
  });
  it("section insertion still appends without replacing", () => {
    const res = insertUnderSection(BLANK_COMMENTS_TEMPLATE, "Two strong saves", "Key Moments");
    expect(res.text).toContain("Two strong saves");
    expect(res.text).toContain("Summary:");
  });
});

describe("legitimate repeated football wording", () => {
  it("does not reject 'save, save' style repetition", () => {
    const t =
      "Summary:\nSave, save. Strong hands throughout and calm distribution under pressure from the press.\n\nKey Moments:\nBlocked a one-on-one.\n\nDevelopment Focus:\nStarting position for crosses.\n";
    expect(validateComments(t)).toEqual({ ok: true });
  });

  it("still rejects testing, testing", () => {
    const r = validateComments(
      "Summary:\nTesting, testing\n\nKey Moments:\n\nDevelopment Focus:\n",
    );
    expect(r.ok).toBe(false);
  });

  it("still rejects a repeated paragraph (A / B / A)", () => {
    const a = "Handled crosses confidently and organised the back line all afternoon well.";
    const b = "Distribution was accurate over both short and long range throughout the game.";
    const r = validateComments(
      `Summary:\n${a}\n\nKey Moments:\n${b}\n\nDevelopment Focus:\n${a}\n`,
    );
    expect(r.ok).toBe(false);
  });
});
