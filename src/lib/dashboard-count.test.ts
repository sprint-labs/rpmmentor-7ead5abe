import { describe, expect, it } from "vitest";
import { requireExactDashboardCount } from "./dashboard-count";

describe("dashboard exact counts", () => {
  it("preserves a genuine zero", () => {
    expect(requireExactDashboardCount({ count: 0, error: null }, "test count")).toBe(0);
  });

  it("fails closed when the source query fails", () => {
    expect(() =>
      requireExactDashboardCount({ count: null, error: new Error("source failed") }, "test count"),
    ).toThrow("Could not load the test count");
  });

  it("fails closed when an exact count is absent", () => {
    expect(() => requireExactDashboardCount({ count: null, error: null }, "test count")).toThrow(
      "Could not load the test count",
    );
  });
});
