// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MentorPrimaryActions } from "./mentor-primary-actions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    search?: unknown;
    className?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("MentorPrimaryActions", () => {
  it("puts match report and interaction first, then calendar", () => {
    const onLogReport = vi.fn();
    const onLogInteraction = vi.fn();
    render(
      <MentorPrimaryActions
        canSubmitReport
        canLogInteraction
        canViewCalendar
        onLogReport={onLogReport}
        onLogInteraction={onLogInteraction}
      />,
    );

    const report = screen.getByRole("button", { name: /submit a match report/i });
    const interaction = screen.getByRole("button", { name: /log interaction/i });
    const calendar = screen.getByRole("link", { name: /view calendar/i });

    expect(report.compareDocumentPosition(interaction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(interaction.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(calendar.getAttribute("href")).toBe("/calendar");
  });

  it("opens the match report and interaction workflows", () => {
    const onLogReport = vi.fn();
    const onLogInteraction = vi.fn();
    render(
      <MentorPrimaryActions
        canSubmitReport
        canLogInteraction
        canViewCalendar
        onLogReport={onLogReport}
        onLogInteraction={onLogInteraction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /submit a match report/i }));
    fireEvent.click(screen.getByRole("button", { name: /log interaction/i }));

    expect(onLogReport).toHaveBeenCalledTimes(1);
    expect(onLogInteraction).toHaveBeenCalledTimes(1);
  });

  it("hides actions the mentor cannot perform", () => {
    render(
      <MentorPrimaryActions
        canSubmitReport={false}
        canLogInteraction={false}
        canViewCalendar={false}
        onLogReport={vi.fn()}
        onLogInteraction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /submit a match report/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /log interaction/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /view calendar/i })).toBeNull();
  });
});
