// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BootSplash, bootSplashCss } from "@/components/boot-splash";

afterEach(cleanup);

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
