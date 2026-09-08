// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { MatchReportRow } from "@/lib/match-reports/schema";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => <a href={params?.reportId ? to.replace("$reportId", params.reportId) : to}>{children}</a>,
}));

import { MatchReportWorkbench } from "@/components/match-report-workbench";

const reports: MatchReportRow[] = [
  {
    report_id: "mr2_aaaaaaaa",
    legacy_report_id: "mr_aaaaaaaa",
    row_index: 2,
    goalkeeper: "Lawrence Vigouroux",
    coach: "Martyn Margetson",
    team: "Swansea",
    opponent: "Wrexham",
    competition: "Championship",
    match_date: "2026-09-05",
    scores: {
      protect_goal: 4,
      protect_space: 3,
      protect_air: 4,
      control_play: 3,
      change_play: 3,
      psych: 4,
      physical: 3,
    },
    average: 3.43,
    comments: "Commanded his box well and handled the long diagonal cleanly.",
  },
  {
    report_id: "mr2_bbbbbbbb",
    legacy_report_id: "mr_bbbbbbbb",
    row_index: 3,
    goalkeeper: "Alfie Smith",
    coach: "Gavin Ward",
    team: "Birmingham City",
    opponent: "Ipswich",
    competition: null,
    match_date: "2026-09-05",
    scores: {
      protect_goal: 3,
      protect_space: 3,
      protect_air: 2,
      control_play: 3,
      change_play: 3,
      psych: 3,
      physical: 3,
    },
    average: 2.9,
    comments: "",
  },
];

function detailPanel(): HTMLElement {
  const panel = document.getElementById("selected-report-detail");
  if (!panel) throw new Error("Selected report detail panel was not rendered");
  return panel;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MatchReportWorkbench", () => {
  it("uses the first report by default and switches complete details in place", () => {
    render(<MatchReportWorkbench reports={reports} periodLabel="2026-08-26 → 2026-09-08" />);

    const first = screen.getByRole("button", {
      name: "Show details for Lawrence Vigouroux on 05 Sept 2026",
    });
    const second = screen.getByRole("button", {
      name: "Show details for Alfie Smith on 05 Sept 2026",
    });
    expect(first.getAttribute("aria-pressed")).toBe("true");

    let detail = within(detailPanel());
    expect(detail.getByRole("heading", { name: "Lawrence Vigouroux" })).toBeTruthy();
    expect(detail.getByText("Swansea v Wrexham · 05 Sept 2026")).toBeTruthy();
    expect(detail.getByText("Championship")).toBeTruthy();
    expect(
      detail.getByText("Commanded his box well and handled the long diagonal cleanly."),
    ).toBeTruthy();
    expect(detail.getByRole("link", { name: /Open full report/ }).getAttribute("href")).toBe(
      "/reports/mr2_aaaaaaaa",
    );

    fireEvent.click(second);
    detail = within(detailPanel());
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(detail.getByRole("heading", { name: "Alfie Smith" })).toBeTruthy();
    expect(detail.getByText("No comments recorded.")).toBeTruthy();
    // Competition is genuinely absent on this row; say so rather than inventing one.
    expect(detail.getAllByText("Not recorded").length).toBeGreaterThan(0);
    expect(detail.getByRole("link", { name: /Open full report/ }).getAttribute("href")).toBe(
      "/reports/mr2_bbbbbbbb",
    );
  });

  it("shows every pillar score for the selected report", () => {
    render(<MatchReportWorkbench reports={reports} periodLabel="2026-08-26 → 2026-09-08" />);

    const detail = within(detailPanel());
    expect(detail.getByText("Protect the Goal")).toBeTruthy();
    expect(detail.getByText("Speed, Agility and Athleticism")).toBeTruthy();
    expect(detail.getAllByText("4/5").length).toBe(3);
    expect(detail.getAllByText("3/5").length).toBe(4);
  });

  it("filters by search, team and mentor while keeping a visible report selected", () => {
    render(<MatchReportWorkbench reports={reports} periodLabel="2026-08-26 → 2026-09-08" />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search match reports" }), {
      target: { value: "ipswich" },
    });
    expect(
      screen.queryByRole("button", { name: /Show details for Lawrence Vigouroux/ }),
    ).toBeNull();
    expect(within(detailPanel()).getByRole("heading", { name: "Alfie Smith" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by team" }), {
      target: { value: "Swansea" },
    });
    expect(
      screen.getByRole("button", { name: /Show details for Lawrence Vigouroux/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show details for Alfie Smith/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by mentor" }), {
      target: { value: "Gavin Ward" },
    });
    expect(screen.getByRole("button", { name: /Show details for Alfie Smith/ })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Show details for Lawrence Vigouroux/ }),
    ).toBeNull();
  });

  it("summarises the filtered set without inventing a score for unscored reports", () => {
    const unscored: MatchReportRow = {
      ...reports[1]!,
      report_id: "mr2_cccccccc",
      goalkeeper: "Unscored Keeper",
      average: null,
    };
    render(
      <MatchReportWorkbench
        reports={[...reports, unscored]}
        periodLabel="2026-08-26 → 2026-09-08"
      />,
    );

    expect(screen.getByText("3")).toBeTruthy();
    // Average is taken from the two scored reports only: (3.43 + 2.90) / 2.
    expect(screen.getByText("3.17")).toBeTruthy();
  });
});
