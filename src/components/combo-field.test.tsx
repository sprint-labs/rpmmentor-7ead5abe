// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComboField } from "./combo-field";

afterEach(cleanup);

const CHAMPIONSHIP = ["Blackburn Rovers", "Bolton Wanderers", "Derby County", "Ipswich Town"];

function Harness({
  options = CHAMPIONSHIP,
  initial = "",
  onChange,
}: {
  options?: string[];
  initial?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <ComboField
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      options={options}
      ariaLabel="Opponent"
      placeholder="e.g. Blackburn Rovers"
    />
  );
}

function input() {
  return screen.getByRole("combobox", { name: "Opponent" });
}

describe("ComboField", () => {
  it("keeps the list closed until the mentor asks for it", () => {
    render(<Harness />);

    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens and filters as the mentor types", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "bl" } });

    const options = screen.getAllByRole("option").map((el) => el.textContent);
    expect(options).toEqual(["Blackburn Rovers"]);
  });

  it("ranks prefix matches above mid-word ones", () => {
    // "Ipswich" contains "wi" mid-word; "Wigan" starts with it.
    render(<Harness options={["Ipswich Town", "Wigan Athletic"]} />);
    fireEvent.change(input(), { target: { value: "wi" } });

    expect(screen.getAllByRole("option").map((el) => el.textContent)).toEqual([
      "Wigan Athletic",
      "Ipswich Town",
    ]);
  });

  it("commits the clicked suggestion and closes", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "der" } });
    fireEvent.mouseDown(screen.getByRole("option", { name: "Derby County" }));

    expect(onChange).toHaveBeenLastCalledWith("Derby County");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("takes the highlighted suggestion on Enter", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "bo" } });
    fireEvent.keyDown(input(), { key: "ArrowDown" });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith("Bolton Wanderers");
  });

  it("leaves Enter alone when nothing is highlighted, so the form can still submit", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(input(), { target: { value: "Some Non-League XI" } });
    onChange.mockClear();
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a typed club that matches nothing — suggestions never restrict the value", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "Hashtag United" } });

    expect((input() as HTMLInputElement).value).toBe("Hashtag United");
    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByText("No matches — what you typed is kept.")).toBeTruthy();
  });

  it("closes on Escape without discarding what was typed", () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "bl" } });
    fireEvent.keyDown(input(), { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect((input() as HTMLInputElement).value).toBe("bl");
  });

  it("disables the toggle when there is nothing to suggest", () => {
    render(<Harness options={[]} />);

    const toggle = screen.getByRole("button", { name: "Show Opponent suggestions" });
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
  });
});
