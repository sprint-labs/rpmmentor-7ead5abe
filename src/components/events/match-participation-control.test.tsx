// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MatchParticipationControl } from "./match-participation-control";

afterEach(cleanup);

describe("MatchParticipationControl", () => {
  it("shows all three states together and updates a goalkeeper in one click", () => {
    const onChange = vi.fn();
    render(
      <MatchParticipationControl
        status="not_confirmed"
        label="Participation — Test Keeper"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Not confirmed" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Played" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(screen.getByRole("button", { name: "Did not play" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Played" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("played");
  });

  it("disables every choice while a save is in progress", () => {
    render(<MatchParticipationControl status="played" disabled onChange={vi.fn()} />);
    for (const name of ["Not confirmed", "Played", "Did not play"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});
