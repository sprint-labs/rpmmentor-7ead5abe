/**
 * Guards the brand assets against Lovable-hosted `/__l5e/...` URLs.
 *
 * Those asset-json URLs work on Lovable previews and 404 on Vercel, which is
 * how the live login page once showed a broken image plus alt text. Everything
 * the auth screens and the header render must be a real file in `public/`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_MARK_SRC, BRAND_WORDMARK_DARK_SRC, BRAND_WORDMARK_LIGHT_SRC } from "./brand";

const BRAND_ASSETS = [BRAND_MARK_SRC, BRAND_WORDMARK_LIGHT_SRC, BRAND_WORDMARK_DARK_SRC];

/** Every screen that shows the brand before, or instead of, the app shell. */
const AUTH_PAGES = [
  "src/routes/login.tsx",
  "src/routes/reset-password.tsx",
  "src/routes/[.]lovable.oauth.consent.tsx",
];

describe("brand assets are served from the Vercel public folder", () => {
  it.each(BRAND_ASSETS)("%s is a checked-in file, not a Lovable URL", (src) => {
    expect(src.startsWith("/__l5e/")).toBe(false);
    expect(src.startsWith("/")).toBe(true);
    expect(existsSync(resolve(`public${src}`))).toBe(true);
  });

  it("ships a separate wordmark cut for each theme", () => {
    // The wordmark's "GK" is ink, not brand green, so one file cannot serve
    // both surfaces. Sharing a path between the two would silently make one
    // theme unreadable.
    expect(BRAND_WORDMARK_LIGHT_SRC).not.toBe(BRAND_WORDMARK_DARK_SRC);
  });

  it.each(AUTH_PAGES)("%s does not load Lovable-hosted brand assets", (file) => {
    const source = readFileSync(resolve(file), "utf8");
    expect(source).not.toMatch(/__l5e/);
    expect(source).not.toMatch(/\.asset\.json/);
    expect(source).toContain("GkhqLockup");
  });
});

describe("the favicon is the G mark", () => {
  it("is a square PNG, so it is not lopsided in a browser tab", () => {
    const file = resolve("public/favicon.png");
    expect(existsSync(file)).toBe(true);

    // PNG header: an 8-byte signature, then the IHDR length/type, then width
    // and height as big-endian 32-bit integers.
    const header = readFileSync(file).subarray(16, 24);
    expect(header.readUInt32BE(0)).toBe(header.readUInt32BE(4));
  });
});
