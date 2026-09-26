import { describe, expect, it } from "vitest";
import { formatDobDisplay } from "./dob-format";

describe("formatDobDisplay", () => {
  it("formats ISO dates as dd/mm/yyyy", () => {
    expect(formatDobDisplay("1995-11-09")).toBe("09/11/1995");
    expect(formatDobDisplay("2004-07-16")).toBe("16/07/2004");
  });

  it("passes through sheet-style dd/mm/yyyy when already stored that way", () => {
    expect(formatDobDisplay("16/07/2004")).toBe("16/07/2004");
  });
});
