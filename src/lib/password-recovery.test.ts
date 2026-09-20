import { describe, expect, it } from "vitest";
import {
  hasAuthCallback,
  isPasswordRecoveryLanding,
  isRecoveryCallback,
  parseRecoveryCallback,
  passwordRecoveryRedirectUrl,
} from "./password-recovery";

describe("password-recovery helpers", () => {
  it("builds the canonical reset redirect URL", () => {
    expect(passwordRecoveryRedirectUrl()).toBe("https://www.rpmmentor.com/reset-password");
  });

  it("detects hash-based recovery callbacks", () => {
    expect(
      isRecoveryCallback({
        hash: "#access_token=abc&refresh_token=def&type=recovery",
        search: "",
      }),
    ).toBe(true);
  });

  it("detects PKCE recovery callbacks", () => {
    expect(
      isRecoveryCallback({
        hash: "",
        search: "?code=abc123&type=recovery",
      }),
    ).toBe(true);
  });

  it("ignores ordinary sign-in callbacks", () => {
    expect(
      isRecoveryCallback({
        hash: "#access_token=abc&type=magiclink",
        search: "",
      }),
    ).toBe(false);
  });

  it("detects auth callback material in the URL", () => {
    expect(hasAuthCallback({ hash: "", search: "?code=abc123" })).toBe(true);
    expect(hasAuthCallback({ hash: "#access_token=abc", search: "" })).toBe(true);
    expect(hasAuthCallback({ hash: "", search: "" })).toBe(false);
  });

  it("treats an invite landing as a recovery callback", () => {
    expect(isRecoveryCallback({ hash: "", search: "?token_hash=abc123&type=invite" })).toBe(true);
    expect(hasAuthCallback({ hash: "", search: "?token_hash=abc123&type=invite" })).toBe(true);
  });
});

describe("parseRecoveryCallback", () => {
  it("reads an invite token hash from the query", () => {
    expect(parseRecoveryCallback({ hash: "", search: "?token_hash=abc123&type=invite" })).toEqual({
      kind: "token_hash",
      tokenHash: "abc123",
      type: "invite",
    });
  });

  it("defaults a token hash without an invite type to recovery", () => {
    expect(parseRecoveryCallback({ hash: "", search: "?token_hash=abc123" })).toEqual({
      kind: "token_hash",
      tokenHash: "abc123",
      type: "recovery",
    });
  });

  it("reads fragment tokens that PKCE detection would reject", () => {
    expect(
      parseRecoveryCallback({
        hash: "#access_token=head.body.sig&expires_in=3600&refresh_token=r3fr35h&token_type=bearer&type=invite",
        search: "",
      }),
    ).toEqual({ kind: "implicit", accessToken: "head.body.sig", refreshToken: "r3fr35h" });
  });

  it("reads a browser-initiated PKCE code", () => {
    expect(parseRecoveryCallback({ hash: "", search: "?code=abc123" })).toEqual({
      kind: "pkce",
      code: "abc123",
    });
  });

  it("reports a URL carrying no auth material", () => {
    expect(parseRecoveryCallback({ hash: "", search: "" })).toEqual({ kind: "none" });
  });

  it("ignores a fragment missing its refresh token", () => {
    expect(parseRecoveryCallback({ hash: "#access_token=head.body.sig", search: "" })).toEqual({
      kind: "none",
    });
  });
});

describe("isPasswordRecoveryLanding", () => {
  it("does not mistake a Google sign-in for a reset", () => {
    // Supabase returns a signed-in caller to the app root carrying the same
    // `?code=` a reset link carries. Reading it as a reset used to route them
    // to /reset-password without the code, which then reported an expired link.
    expect(isPasswordRecoveryLanding({ pathname: "/", hash: "", search: "?code=oauth-code" })).toBe(
      false,
    );
  });

  it("does not mistake a Google sign-in onto a deep link for a reset", () => {
    expect(
      isPasswordRecoveryLanding({ pathname: "/calendar", hash: "", search: "?code=oauth-code" }),
    ).toBe(false);
  });

  it("reads a browser-initiated reset landing on the reset route", () => {
    expect(
      isPasswordRecoveryLanding({
        pathname: "/reset-password",
        hash: "",
        search: "?code=reset-code",
      }),
    ).toBe(true);
  });

  it("tolerates a trailing slash on the reset route", () => {
    expect(
      isPasswordRecoveryLanding({
        pathname: "/reset-password/",
        hash: "",
        search: "?code=reset-code",
      }),
    ).toBe(true);
  });

  it("reads an invite token hash wherever it lands", () => {
    expect(
      isPasswordRecoveryLanding({
        pathname: "/",
        hash: "",
        search: "?token_hash=abc123&type=invite",
      }),
    ).toBe(true);
  });

  it("reads a bare token hash wherever it lands", () => {
    expect(
      isPasswordRecoveryLanding({ pathname: "/", hash: "", search: "?token_hash=abc123" }),
    ).toBe(true);
  });

  it("reads fragment recovery tokens wherever they land", () => {
    expect(
      isPasswordRecoveryLanding({
        pathname: "/",
        hash: "#access_token=head.body.sig&refresh_token=r3fr35h&type=recovery",
        search: "",
      }),
    ).toBe(true);
  });

  it("ignores an ordinary page load", () => {
    expect(isPasswordRecoveryLanding({ pathname: "/", hash: "", search: "" })).toBe(false);
    expect(isPasswordRecoveryLanding({ pathname: "/reset-password", hash: "", search: "" })).toBe(
      false,
    );
  });
});
