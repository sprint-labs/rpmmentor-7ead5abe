// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  BootSplash,
  SIGN_IN_SPLASH_MS,
  SignInSplash,
  bootSplashCss,
  bootSplashSkipScript,
} from "@/components/boot-splash";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-no-splash");
});

describe("BootSplash", () => {
  it("draws the brand mark from the shipped asset rather than retyping GK", () => {
    const { container } = render(<BootSplash />);

    const mark = container.querySelector<HTMLImageElement>("img.bs-base");
    expect(mark?.getAttribute("src")).toBe("/gkhq-mark.png");
    expect(container.textContent).not.toContain("GK");
    expect(container.textContent).toContain("Mentor Hub");
  });

  it("stays out of the accessibility tree", () => {
    const { container } = render(<BootSplash />);

    const splash = container.querySelector("#boot-splash");
    expect(splash?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("img.bs-base")?.getAttribute("alt")).toBe("");
  });
});

describe("bootSplashCss", () => {
  it("cuts the fill out of the brand mark instead of drawing a rectangle", () => {
    expect(bootSplashCss).toContain("-webkit-mask-image:url(/gkhq-mark.png)");
    expect(bootSplashCss).toContain("mask-image:url(/gkhq-mark.png)");
  });

  it("hides the masked fill where masks are unsupported, so no green box shows", () => {
    expect(bootSplashCss).toMatch(/\.bs-fill\{display:none/);
    expect(bootSplashCss).toContain("@supports ((-webkit-mask-image:url(/gkhq-mark.png))");
  });

  it("stills every animation under prefers-reduced-motion", () => {
    const reduced = bootSplashCss.slice(bootSplashCss.indexOf("@media (prefers-reduced-motion"));
    for (const layer of [".bs-glow", ".bs-fill", ".bs-bar::after"]) {
      expect(reduced).toContain(layer);
    }
    expect(reduced).toContain("animation:none");
  });
});

describe("bootSplashSkipScript", () => {
  it("skips the page-load splash when nobody is signed in", () => {
    new Function(bootSplashSkipScript)();

    expect(document.documentElement.getAttribute("data-no-splash")).toBe("1");
    expect(bootSplashCss).toContain("html[data-no-splash] #boot-splash{display:none}");
  });

  it("keeps the page-load splash for a saved session", () => {
    localStorage.setItem("sb-abcdef-auth-token", "{}");

    new Function(bootSplashSkipScript)();

    expect(document.documentElement.hasAttribute("data-no-splash")).toBe(false);
  });
});

describe("SignInSplash", () => {
  it("announces the sign-in and reuses the splash art", () => {
    const { getByRole, container } = render(<SignInSplash />);

    expect(getByRole("status").getAttribute("aria-label")).toBe("Signing you in");
    expect(container.querySelector("img.bs-base")?.getAttribute("src")).toBe("/gkhq-mark.png");
    expect(container.querySelector("#boot-splash")).toBeNull();
  });

  it("holds for exactly one fill loop", () => {
    expect(bootSplashCss).toContain(`animation:bs-rise ${SIGN_IN_SPLASH_MS / 1000}s`);
  });
});
