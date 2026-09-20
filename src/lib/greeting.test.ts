import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting";

describe("greetingFor", () => {
  it("uses the first name and the time of day", () => {
    expect(greetingFor("Luke Smith", new Date(2026, 8, 20, 6))).toBe("Good morning, Luke");
    expect(greetingFor("Luke Smith", new Date(2026, 8, 20, 12))).toBe("Good afternoon, Luke");
    expect(greetingFor("Luke Smith", new Date(2026, 8, 20, 18))).toBe("Good evening, Luke");
  });

  it("keeps a single-word name whole", () => {
    expect(greetingFor("Luke", new Date(2026, 8, 20, 9))).toBe("Good morning, Luke");
  });
});
