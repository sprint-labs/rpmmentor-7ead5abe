import { describe, expect, it } from "vitest";
import { isPublicRoute } from "./public-routes";

describe("public routes", () => {
  it.each(["/login", "/install", "/reset-password"])(
    "allows signed-out access to %s",
    (pathname) => {
      expect(isPublicRoute(pathname)).toBe(true);
    },
  );

  it("keeps authenticated application routes private", () => {
    expect(isPublicRoute("/")).toBe(false);
    expect(isPublicRoute("/reports")).toBe(false);
  });
});
