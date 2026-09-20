// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BentoFeaturesPage } from "./design.bento-features";

afterEach(() => {
  cleanup();
});

describe("BentoFeaturesPage", () => {
  it("renders the page heading and all six bento slots", () => {
    render(<BentoFeaturesPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Product Features" })).toBeTruthy();

    for (const card of [
      "Zapier Integration",
      "Trackers Connected",
      "Focusing",
      "Team’s Productivity",
      "Shortcut Keys",
    ]) {
      expect(screen.getByText(card)).toBeTruthy();
    }

    expect(screen.getByText("10X")).toBeTruthy();
  });

  it("gives the integration toggle and configure action accessible names", () => {
    render(<BentoFeaturesPage />);

    expect(screen.getByRole("switch", { name: "Toggle Zapier integration" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Configure/ })).toBeTruthy();
  });

  it("labels every connected tracker avatar", () => {
    render(<BentoFeaturesPage />);

    for (const name of ["Amelia Fraser", "Priya Raman", "Tom Okafor"]) {
      expect(
        screen.getByText(
          name
            .split(" ")
            .map((part) => part[0])
            .join(""),
        ),
      ).toBeTruthy();
    }
  });
});
