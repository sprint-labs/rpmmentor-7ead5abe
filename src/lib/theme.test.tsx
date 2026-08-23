// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./theme";

const storedThemes = new Map<string, string>();

function ThemeControls() {
  const { theme, toggle } = useTheme();

  return (
    <>
      <output aria-label="Current theme">{theme}</output>
      <button
        type="button"
        onClick={() => {
          toggle();
          toggle();
        }}
      >
        Toggle theme twice
      </button>
    </>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    document.documentElement.classList.add("dark");
    storedThemes.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storedThemes.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storedThemes.set(key, value);
      },
    });
  });

  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove("dark");
    vi.unstubAllGlobals();
  });

  it("uses each immediately applied theme when toggled again before React can render", () => {
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme twice" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("rpm.theme")).toBe("dark");
    expect(screen.getByLabelText("Current theme").textContent).toBe("dark");
  });
});
