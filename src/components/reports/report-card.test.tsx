// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ReportCard } from "./report-card";
import type { MatchReportRow } from "@/lib/match-reports/schema";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={params ? `${to}:${Object.values(params).join("/")}` : to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
});

function report(overrides: Partial<MatchReportRow> = {}): MatchReportRow {
  return {
    report_id: "r1",
    legacy_report_id: "r1-legacy",
    row_index: 1,
    goalkeeper: "Joe Lumley",
    coach: "Ben Beson",
    team: "Stevenage",
    opponent: "Sheffield Wednesday",
    competition: "League One",
    match_date: "2026-09-20",
    scores: {
      protect_goal: 5,
      protect_space: 4,
      protect_air: 3,
      control_play: 2,
      change_play: 1,
      psych: 4,
      physical: null,
    },
    average: 3.2,
    comments: "Commanded his area well and dealt with crosses confidently.",
    ...overrides,
  };
}

describe("ReportCard", () => {
  it("shows the goalkeeper, the fixture and the average", () => {
    render(
      <ReportCard
        report={report()}
        goalkeeper={undefined}
        canLogInteraction={false}
        onLogInteraction={vi.fn()}
      />,
    );

    expect(screen.getByText("Joe Lumley")).not.toBeNull();
    expect(screen.getByText("Stevenage v Sheffield Wednesday")).not.toBeNull();
    expect(screen.getByText("3.2")).not.toBeNull();
    expect(screen.getByText(/Reported by Ben Beson/)).not.toBeNull();
  });

  it("puts all seven pillar scores on the card", () => {
    render(
      <ReportCard
        report={report()}
        goalkeeper={undefined}
        canLogInteraction={false}
        onLogInteraction={vi.fn()}
      />,
    );

    for (const label of ["Goal", "Space", "Air", "Control", "Change", "Mental", "Physical"]) {
      expect(screen.getByText(label)).not.toBeNull();
    }
    // The unscored pillar says so rather than showing a zero.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("reads a date-only match date as that day, not the one before", () => {
    render(
      <ReportCard
        report={report()}
        goalkeeper={undefined}
        canLogInteraction={false}
        onLogInteraction={vi.fn()}
      />,
    );

    // 2026-09-20 is a Sunday. Parsed as UTC midnight it would render as Sat 19.
    // Matched loosely: the line also carries the competition, and ICU spells
    // the short month "Sept" in some versions and "Sep" in others.
    expect(screen.getByText(/Sun.*20 Sep.*2026/)).not.toBeNull();
  });

  it("says so rather than inventing a fixture or a mentor", () => {
    render(
      <ReportCard
        report={report({ team: null, opponent: null, coach: "", match_date: null })}
        goalkeeper={undefined}
        canLogInteraction={false}
        onLogInteraction={vi.fn()}
      />,
    );

    expect(screen.getByText("Fixture not recorded")).not.toBeNull();
    expect(screen.getByText("Mentor not recorded")).not.toBeNull();
    // Shares its line with the competition, so matched as a substring.
    expect(screen.getByText(/Date not recorded/)).not.toBeNull();
  });

  it("offers the log action only to someone who may log one", () => {
    const onLogInteraction = vi.fn();
    const { rerender } = render(
      <ReportCard
        report={report()}
        goalkeeper={undefined}
        canLogInteraction={false}
        onLogInteraction={onLogInteraction}
      />,
    );
    expect(screen.queryByRole("button", { name: /log an interaction/i })).toBeNull();

    rerender(
      <ReportCard
        report={report()}
        goalkeeper={undefined}
        canLogInteraction
        onLogInteraction={onLogInteraction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /log an interaction for Joe Lumley/i }));
    expect(onLogInteraction).toHaveBeenCalledTimes(1);
  });

  it("names the goalkeeper in the open link, so it is not eight identical 'Open's", () => {
    render(
      <ReportCard
        report={report()}
        goalkeeper={undefined}
        canLogInteraction={false}
        onLogInteraction={vi.fn()}
      />,
    );

    const open = screen.getByRole("link", { name: /open the report for Joe Lumley/i });
    expect(open.getAttribute("href")).toContain("r1");
  });
});
