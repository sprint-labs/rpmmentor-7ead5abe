import { describe, expect, it } from "vitest";
import { formatContractExpiry } from "@/lib/contract-expiry";

describe("formatContractExpiry", () => {
  it("shows the month and year the roster actually recorded", () => {
    expect(formatContractExpiry("2028-06-30")).toBe("June 2028");
    expect(formatContractExpiry("2026-12-30")).toBe("December 2026");
  });

  it("does not invent a date out of something that is not one", () => {
    expect(formatContractExpiry("—")).toBe("-");
    expect(formatContractExpiry("")).toBe("Not recorded");
    expect(formatContractExpiry("June 2028")).toBe("Not recorded");
    expect(formatContractExpiry("2028")).toBe("Not recorded");
  });
});
