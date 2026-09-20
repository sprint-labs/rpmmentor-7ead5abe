import { describe, expect, it } from "vitest";
import {
  ALIAS_HOSTS,
  CANONICAL_HOST,
  CANONICAL_ORIGIN,
  canonicalOriginScript,
  canonicalUrl,
} from "./canonical-url";

describe("canonicalUrl", () => {
  it("builds an absolute URL on the canonical origin", () => {
    expect(canonicalUrl("/reset-password")).toBe("https://www.rpmmentor.com/reset-password");
  });

  it("tolerates a path given without its leading slash", () => {
    expect(canonicalUrl("login")).toBe("https://www.rpmmentor.com/login");
  });

  it("names the canonical host", () => {
    expect(CANONICAL_HOST).toBe("www.rpmmentor.com");
  });
});

/**
 * Runs the shipped pre-hydration script against a stand-in address bar and
 * reports where, if anywhere, it sent the page.
 */
function runScriptAt(url: string): string | null {
  const parsed = new URL(url);
  let replacedWith: string | null = null;
  const window = {
    location: {
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
      replace: (next: string) => {
        replacedWith = next;
      },
    },
  };
  new Function("window", canonicalOriginScript)(window);
  return replacedWith;
}

describe("canonicalOriginScript", () => {
  it("hands the apex over to the canonical origin, query intact", () => {
    // The apex serves the same app rather than redirecting to www, so a
    // sign-in started there writes its PKCE verifier to storage the callback
    // — which always lands on the canonical origin — can never read.
    expect(runScriptAt("https://rpmmentor.com/login?next=%2Fcalendar")).toBe(
      "https://www.rpmmentor.com/login?next=%2Fcalendar",
    );
  });

  it("carries a fragment across too", () => {
    expect(runScriptAt("https://rpmmentor.com/reset-password#access_token=abc&type=recovery")).toBe(
      "https://www.rpmmentor.com/reset-password#access_token=abc&type=recovery",
    );
  });

  it("leaves the canonical origin alone", () => {
    expect(runScriptAt("https://www.rpmmentor.com/login")).toBeNull();
  });

  it("leaves previews and local development alone", () => {
    expect(runScriptAt("https://rpmmentor-7ead5abe.vercel.app/login")).toBeNull();
    expect(runScriptAt("http://localhost:8080/login")).toBeNull();
  });

  it("cannot redirect the canonical host to itself", () => {
    // A loop here would be unrecoverable: every load would replace itself.
    expect(ALIAS_HOSTS).not.toContain(CANONICAL_HOST);
    expect(canonicalOriginScript).toContain(CANONICAL_ORIGIN);
  });
});
