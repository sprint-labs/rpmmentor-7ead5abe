import { describe, it, expect } from "vitest";
import { flagFor } from "@/lib/nationality-flag";

describe("flagFor", () => {
  it("gives the Home Nations their own subdivision flags, not the Union Flag", () => {
    expect(flagFor("England")).toBe(
      "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
    );
    expect(flagFor("Scotland")).toBe(
      "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
    );
    expect(flagFor("Wales")).toBe(
      "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
    );
  });

  it("returns nothing for Northern Ireland, which has no emoji flag", () => {
    // Unicode never assigned one. Substituting the Union Flag would state
    // something different about a real person's citizenship.
    expect(flagFor("Northern Ireland")).toBeNull();
  });

  it("maps the country spellings actually stored in the roster", () => {
    expect(flagFor("Republic of Ireland")).toBe("\u{1F1EE}\u{1F1EA}");
    expect(flagFor("Australia")).toBe("\u{1F1E6}\u{1F1FA}");
    expect(flagFor("Sweden")).toBe("\u{1F1F8}\u{1F1EA}");
    expect(flagFor("Bosnia-Herzegovina")).toBe("\u{1F1E7}\u{1F1E6}");
    expect(flagFor("United Arab Emirates")).toBe("\u{1F1E6}\u{1F1EA}");
    expect(flagFor("New Zealand")).toBe("\u{1F1F3}\u{1F1FF}");
  });

  it("covers every nationality in the live roster", () => {
    // Verified against public.players on 2026-09-19. Northern Ireland is the
    // one deliberate gap.
    const live = [
      "England",
      "Republic of Ireland",
      "Australia",
      "Wales",
      "Scotland",
      "Sweden",
      "New Zealand",
      "Chile",
      "Bosnia-Herzegovina",
      "Senegal",
      "Uganda",
      "United Arab Emirates",
      "France",
      "Denmark",
      "Poland",
      "Portugal",
    ];
    for (const nationality of live) {
      expect(flagFor(nationality), nationality).not.toBeNull();
    }
  });

  it("ignores case and surrounding whitespace", () => {
    expect(flagFor("  england  ")).toBe(flagFor("England"));
    expect(flagFor("FRANCE")).toBe(flagFor("France"));
  });

  it("returns nothing rather than guessing at an unknown or empty value", () => {
    for (const value of ["", "   ", "Atlantis", "Not recorded", null, undefined]) {
      expect(flagFor(value)).toBeNull();
    }
  });
});
