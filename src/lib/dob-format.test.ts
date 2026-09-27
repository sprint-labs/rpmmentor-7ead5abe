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

  it("keeps the day east of Greenwich, British Summer Time included", () => {
    // The regression this exists for: `parseDob` builds the date at LOCAL
    // midnight, and this read it back with UTC getters. In BST that midnight is
    // 23:00 the previous day in UTC, so every profile showed a DOB one day
    // early for the whole UK audience. CI runs in UTC, where the bug is
    // invisible, so the timezone is pinned here.
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Europe/London";

    try {
      expect(formatDobDisplay("2004-07-16")).toBe("16/07/2004");
      expect(formatDobDisplay("1995-11-09")).toBe("09/11/1995");
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });
});
