// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import { AccentProposalPage } from "./design.accent-proposal";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

function renderPage() {
  return render(
    <ThemeProvider>
      <AccentProposalPage />
    </ThemeProvider>,
  );
}

describe("AccentProposalPage", () => {
  it("renders the proposal shell with its section headings", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Accent Proposal" })).toBeTruthy();
    for (const section of [
      "The System",
      "Tokens",
      "Applied",
      "Rules of Engagement",
      "Adoption Notes",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: section })).toBeTruthy();
    }
  });

  it("documents every token in the Volt Signal family", () => {
    renderPage();

    for (const cssVar of [
      "--accent-volt",
      "--accent-ink",
      "--accent-soft",
      "--accent-edge",
      "--accent-glow",
    ]) {
      expect(screen.getByText(cssVar)).toBeTruthy();
    }
  });

  it("shows current vs proposed for each applied sample", () => {
    renderPage();

    const current = screen.getAllByText("Current");
    const proposed = screen.getAllByText("Proposed");
    expect(current.length).toBe(4);
    expect(proposed.length).toBe(current.length);
  });

  it("offers a theme preview toggle that flips the html class", () => {
    document.documentElement.classList.add("dark");
    const { getByRole } = renderPage();

    fireEvent.click(getByRole("button", { name: /preview light/i }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("degrades gracefully when computed styles are unavailable (SSR/jsdom)", () => {
    // jsdom's getComputedStyle cannot resolve the stylesheet tokens, so the
    // page must render without grade chips rather than crash — the same
    // no-token path the server render takes.
    renderPage();
    expect(screen.queryAllByTestId("grade-chip")).toHaveLength(0);
    expect(screen.getByText(/Self-check/)).toBeTruthy();
  });
});
