// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader, SectionTitle } from "./primitives";

describe("responsive primitive overrides", () => {
  it("applies a page-specific title scale without changing the shared default", () => {
    const { rerender } = render(
      <PageHeader title="Good morning, David" titleClassName="text-2xl leading-tight" />,
    );

    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-2xl");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("leading-tight");

    rerender(<PageHeader title="Calendar" />);

    expect(screen.getByRole("heading", { level: 1 }).className).toContain("text-3xl");
  });

  it("allows one section heading to stack without changing every section", () => {
    render(
      <SectionTitle className="flex-col items-start" action={<span>Legend</span>}>
        Duty of Care Monitor
      </SectionTitle>,
    );

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.parentElement?.className).toContain("flex-col");
    expect(heading.parentElement?.className).toContain("items-start");
    expect(screen.getByText("Legend")).toBeTruthy();
  });
});
