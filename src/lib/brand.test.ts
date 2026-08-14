/**
 * Guards the login lockup against Lovable-hosted `/__l5e/...` URLs.
 *
 * Those asset-json URLs work on Lovable previews and 404 on Vercel, which is
 * how the live login page showed a broken image plus alt text.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOGIN_LOCKUP_SRC } from "./brand";

const AUTH_PAGES = [
  "src/routes/login.tsx",
  "src/routes/reset-password.tsx",
  "src/routes/[.]lovable.oauth.consent.tsx",
];

describe("login lockup is served from the Vercel public folder", () => {
  it("points at the checked-in lockup, not a Lovable __l5e URL", () => {
    expect(LOGIN_LOCKUP_SRC).toBe("/gkhq-lockup.svg");
    expect(LOGIN_LOCKUP_SRC.startsWith("/__l5e/")).toBe(false);
    expect(existsSync(resolve("public/gkhq-lockup.svg"))).toBe(true);
  });

  it.each(AUTH_PAGES)("%s does not load Lovable-hosted brand assets", (file) => {
    const source = readFileSync(resolve(file), "utf8");
    expect(source).not.toMatch(/__l5e/);
    expect(source).not.toMatch(/\.asset\.json/);
    expect(source).toContain("LOGIN_LOCKUP_SRC");
  });
});
