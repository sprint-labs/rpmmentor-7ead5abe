// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import { GkhqDesignSystemPage } from "./design.gkhq";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-theme");
});

function renderPage() {
  return render(
    <ThemeProvider>
      <GkhqDesignSystemPage />
    </ThemeProvider>,
  );
}

describe("GkhqDesignSystemPage", () => {
  it("renders the reference shell with its section headings", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "GKHQ Design System" })).toBeTruthy();
    for (const section of [
      "The System",
      "Brand & Surfaces",
      "Traffic Light — state only",
      "Tags — category only",
      "Scales",
      "Type",
      "Radii",
      "Components",
      "Rules of Engagement",
      "Adoption",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeTruthy();
    }
  });

  it("documents the core GKHQ tokens by their CSS custom property names", () => {
    renderPage();

    for (const cssVar of [
      "--primary",
      "--primary-ink",
      "--background",
      "--muted-foreground",
      "--success",
      "--warning",
      "--destructive",
      "--neutral",
      "--info",
      "--flux-magenta",
      "--ember-orange",
    ]) {
      expect(screen.getByText(cssVar)).toBeTruthy();
    }
  });

  it("keeps the two colour families labelled as separate jobs", () => {
    renderPage();

    // The whole point of the system: a tag hue never means a state.
    expect(
      screen.getByRole("heading", { level: 2, name: "Traffic Light — state only" }),
    ).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Tags — category only" })).toBeTruthy();
    expect(
      screen.getByText(
        "Never use a tag hue to signal a state, or a traffic-light hue to classify.",
      ),
    ).toBeTruthy();
  });

  it("publishes the radius scale the system standardises on", () => {
    renderPage();

    for (const spec of [
      "--radius-sm · 5px",
      "--radius-md · 7px",
      "--radius-lg · 12px",
      "--radius-xl · 16px",
    ]) {
      expect(screen.getByText(spec)).toBeTruthy();
    }
  });
});
