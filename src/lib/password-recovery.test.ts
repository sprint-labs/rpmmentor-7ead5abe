import { describe, expect, it } from "vitest";
import {
  hasAuthCallback,
  isRecoveryCallback,
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
});
