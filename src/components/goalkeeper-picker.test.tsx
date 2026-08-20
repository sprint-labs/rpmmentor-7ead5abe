// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GoalkeeperPicker } from "@/components/goalkeeper-picker";
import type { PlayerRosterRow } from "@/lib/players.functions";

const PLAYERS: PlayerRosterRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Zoe Keeper",
    current_club: "Northern FC",
    parent_club: null,
    on_loan: false,
    league: "Championship",
    nationality: "England",
    instagram_url: null,
    contract_until: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "Alex Goalkeeper",
    current_club: "Southern United",
    parent_club: null,
    on_loan: false,
    league: "League One",
    nationality: "Wales",
    instagram_url: null,
    contract_until: null,
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("GoalkeeperPicker", () => {
  it("exposes an accessible Goalkeeper combobox and filters canonical players by name", async () => {
    const onValueChange = vi.fn();
    render(<GoalkeeperPicker players={PLAYERS} value={null} onValueChange={onValueChange} />);

    const trigger = screen.getByRole("combobox", { name: "Goalkeeper" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    fireEvent.change(screen.getByRole("combobox", { name: "Search Goalkeeper" }), {
      target: { value: "alex" },
    });

    await waitFor(() => {
      expect(screen.getByText("Alex Goalkeeper")).toBeTruthy();
      expect(screen.queryByText("Zoe Keeper")).toBeNull();
    });

    fireEvent.click(screen.getByText("Alex Goalkeeper"));
    expect(onValueChange).toHaveBeenCalledWith(PLAYERS[1]!.id, PLAYERS[1]);
  });

  it("renders names only in result rows", () => {
    render(<GoalkeeperPicker players={PLAYERS} value={null} onValueChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Goalkeeper" }));
    expect(screen.getByText("Alex Goalkeeper")).toBeTruthy();
    expect(screen.getByText("Zoe Keeper")).toBeTruthy();
    expect(screen.queryByText("Northern FC")).toBeNull();
    expect(screen.queryByText("Southern United")).toBeNull();
    expect(screen.queryByText("Championship")).toBeNull();
    expect(screen.queryByText("League One")).toBeNull();
  });

  it("returns null through the optional clear action", () => {
    const onValueChange = vi.fn();
    render(
      <GoalkeeperPicker players={PLAYERS} value={PLAYERS[0]!.id} onValueChange={onValueChange} />,
    );

    expect(screen.getByRole("combobox", { name: "Goalkeeper" }).textContent).toContain(
      "Zoe Keeper",
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear goalkeeper" }));
    expect(onValueChange).toHaveBeenCalledWith(null, null);
  });

  it("hides clear for required use and reports the required state", () => {
    render(
      <GoalkeeperPicker
        players={PLAYERS}
        value={PLAYERS[0]!.id}
        onValueChange={vi.fn()}
        required
      />,
    );

    expect(screen.getByRole("combobox", { name: "Goalkeeper" }).getAttribute("aria-required")).toBe(
      "true",
    );
    expect(screen.queryByRole("button", { name: "Clear goalkeeper" })).toBeNull();
  });

  it("disables interaction and shows progress while loading", () => {
    render(<GoalkeeperPicker players={[]} value={null} onValueChange={vi.fn()} loading />);

    const trigger = screen.getByRole("combobox", { name: "Goalkeeper" }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toContain("Loading goalkeepers…");
  });

  it("disables interaction and associates a visible query error", () => {
    render(
      <GoalkeeperPicker
        players={[]}
        value={null}
        onValueChange={vi.fn()}
        error="Could not load goalkeepers."
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Goalkeeper" }) as HTMLButtonElement;
    const alert = screen.getByRole("alert");
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute("aria-invalid")).toBe("true");
    expect(trigger.getAttribute("aria-describedby")).toBe(alert.id);
    expect(alert.textContent).toBe("Could not load goalkeepers.");
  });

  it("supports an explicitly disabled state", () => {
    render(<GoalkeeperPicker players={PLAYERS} value={null} onValueChange={vi.fn()} disabled />);

    expect(
      (screen.getByRole("combobox", { name: "Goalkeeper" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows a clear empty result rather than falling back to legacy goalkeeper data", () => {
    render(<GoalkeeperPicker players={[]} value={null} onValueChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Goalkeeper" }));
    expect(screen.getByText("No goalkeepers found.")).toBeTruthy();
  });
});
