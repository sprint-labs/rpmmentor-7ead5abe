import { describe, expect, it } from "vitest";
import { clubAccent, clubInitials, CLUB_ACCENT_COUNT } from "./club-identity";

describe("clubInitials", () => {
  it("takes the distinctive words", () => {
    expect(clubInitials("Sheffield Wednesday")).toBe("SW");
    expect(clubInitials("Colchester United")).toBe("CU");
  });

  it("keeps the common suffix when dropping it would leave one letter", () => {
    // Otherwise every Manchester, Leeds and Stoke club shares a badge.
    expect(clubInitials("Manchester United")).toBe("MU");
    expect(clubInitials("Manchester City")).toBe("MC");
    expect(clubInitials("Leicester City")).toBe("LC");
  });

  it("abbreviates a one-word club the way a fan would", () => {
    expect(clubInitials("Wolves")).toBe("WOL");
    expect(clubInitials("Arsenal")).toBe("ARS");
  });

  it("copes with punctuation, noise words and stray spacing", () => {
    expect(clubInitials("  Brighton & Hove Albion  ")).toBe("BH");
    expect(clubInitials("Tottenham Hotspur F.C.")).toBe("TH");
  });

  it("says nothing rather than guessing when there is no name", () => {
    expect(clubInitials("")).toBe("—");
    expect(clubInitials("   ")).toBe("—");
  });

  it("still produces a badge when every word is a noise word", () => {
    expect(clubInitials("City")).toBe("CIT");
  });
});

describe("clubAccent", () => {
  it("stays on the ramp", () => {
    for (const club of ["Wolves", "Reading", "Wigan Athletic", "", "x"]) {
      const accent = clubAccent(club);
      expect(accent).toBeGreaterThanOrEqual(1);
      expect(accent).toBeLessThanOrEqual(CLUB_ACCENT_COUNT);
    }
  });

  it("gives one club the same colour every time", () => {
    expect(clubAccent("Stevenage")).toBe(clubAccent("Stevenage"));
    // Case and padding are not part of a club's identity.
    expect(clubAccent("  stevenage ")).toBe(clubAccent("Stevenage"));
  });

  it("spreads a real roster of clubs across the ramp", () => {
    const clubs = [
      "Stevenage",
      "Sheffield Wednesday",
      "Shrewsbury Town",
      "Colchester United",
      "Leicester City",
      "Wigan Athletic",
      "Wycombe Wanderers",
      "Reading",
      "Tranmere Rovers",
      "Walsall",
    ];
    const used = new Set(clubs.map(clubAccent));
    // Not a guarantee of perfect spread, but a hash that collapsed everything
    // onto one colour would defeat the point of having a ramp.
    expect(used.size).toBeGreaterThan(2);
  });
});
