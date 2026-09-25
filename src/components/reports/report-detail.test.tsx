// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  FormStrip,
  MentorVerdict,
  PillarBreakdown,
  PillarStandouts,
  PlayerSnapshot,
  ReportHero,
} from "./report-detail";
import { goalkeeperForm } from "@/lib/match-reports/goalkeeper-form";
import type { MatchReportRow } from "@/lib/match-reports/schema";
import type { Goalkeeper } from "@/lib/mock-data";

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
    report_id: "mr2_current",
    legacy_report_id: "legacy",
    row_index: 1,
    goalkeeper: "James Beadle",
    coach: "Andy Marshall",
    team: "Birmingham City",
    opponent: "Norwich City",
    competition: "EFL Championship",
    match_date: "2026-09-09",
    scores: {
      protect_goal: 5,
      protect_space: 5,
      protect_air: 3,
      control_play: 4,
      change_play: 4,
      psych: 5,
      physical: 3,
    },
    average: 4.1,
    comments: "A really solid performance.",
    ...overrides,
  };
}

const earlier = report({
  report_id: "mr2_earlier",
  match_date: "2026-08-30",
  opponent: "Leeds United",
  average: 3.1,
  scores: {
    protect_goal: 3,
    protect_space: 3,
    protect_air: 3,
    control_play: 3,
    change_play: 3,
    psych: 3,
    physical: 4,
  },
});

const goalkeeper = {
  id: "gk-james-beadle",
  name: "James Beadle",
  tier: "Tier 1",
  tags: [],
  club: "Birmingham City",
  league: "EFL Championship",
  nationality: "England",
  age: 22,
  profileImage: "/players/james-beadle.webp",
} as unknown as Goalkeeper;

describe("ReportHero", () => {
  it("leads with the goalkeeper, the fixture and the rating in its band", () => {
    render(<ReportHero report={report()} goalkeeper={goalkeeper} />);

    expect(screen.getByRole("heading", { level: 1, name: "James Beadle" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "James Beadle portrait" })).toBeTruthy();
    expect(screen.getByText("Tier 1")).toBeTruthy();
    expect(screen.getByText("Birmingham City")).toBeTruthy();
    expect(screen.getByText("Norwich City")).toBeTruthy();
    expect(screen.getByText("Reported by Andy Marshall")).toBeTruthy();
    expect(screen.getByText("4.1").className).toContain("text-rating-elite");
    expect(screen.getByText("Performing at top of current level")).toBeTruthy();
    expect(screen.queryByText("Elite")).toBeNull();
    expect(screen.getByRole("link", { name: /View goalkeeper profile/ }).getAttribute("href")).toBe(
      "/goalkeepers/$gkId:gk-james-beadle",
    );
  });

  it("falls back to initials and no profile link off the roster", () => {
    render(<ReportHero report={report({ competition: null })} goalkeeper={undefined} />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByLabelText("James Beadle portrait").textContent).toBe("JB");
    expect(screen.getByText("Competition not recorded")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /View goalkeeper profile/ })).toBeNull();
  });
});

describe("PlayerSnapshot", () => {
  it("puts the goalkeeper's averages and this match's change beside the report", () => {
    const current = report();
    render(
      <PlayerSnapshot
        report={current}
        form={goalkeeperForm([current, earlier], current)}
        goalkeeper={goalkeeper}
      />,
    );

    const snapshot = within(screen.getByRole("region", { name: "Goalkeeper snapshot" }));
    // (4.1 + 3.1) / 2
    expect(snapshot.getAllByText("3.6").length).toBe(2);
    expect(snapshot.getByText("+1.0")).toBeTruthy();
    expect(snapshot.getByText("vs 1 other report")).toBeTruthy();
    expect(snapshot.getByText("England")).toBeTruthy();
    expect(snapshot.getByText("Age 22")).toBeTruthy();
    // Overall (4.1 + 3.1) / 2 = 3.6, in RPM's words rather than "Strong overall".
    expect(snapshot.getByText("Performing at current level")).toBeTruthy();
    expect(snapshot.queryByText(/overall/i)).toBeNull();
  });
});

describe("PillarBreakdown", () => {
  it("scores every pillar and compares it with the goalkeeper's other reports", () => {
    const current = report();
    render(<PillarBreakdown report={current} form={goalkeeperForm([current, earlier], current)} />);

    expect(screen.getByText("Protect the Goal")).toBeTruthy();
    expect(screen.getAllByText("5/5").length).toBe(3);
    expect(screen.getAllByText("+2.0").length).toBe(3);
    expect(screen.getByText("−1.0")).toBeTruthy();
    expect(screen.getByText(/across 1 other report\./)).toBeTruthy();
  });

  it("shows the scores without comparisons until the history loads", () => {
    render(<PillarBreakdown report={report()} form={null} />);
    expect(screen.getAllByText("5/5").length).toBe(3);
    expect(screen.queryByText(/\+/)).toBeNull();
  });

  it("lists RPM's rating system as the key, not the design system's band names", () => {
    render(<PillarBreakdown report={report()} form={null} />);

    const scale = screen.getByRole("group", { name: "Rating scale" });
    expect(
      within(scale)
        .getAllByRole("definition")
        .map((d) => d.textContent),
    ).toEqual([
      "Performing above current level",
      "Performing at top of current level",
      "Performing at current level",
      "Performing below current level",
      "Cause for concern",
    ]);
    for (const band of ["Elite", "Strong", "Average", "Poor"]) {
      expect(screen.queryByText(new RegExp(`\\b${band}\\b`))).toBeNull();
    }
  });
});

describe("PillarStandouts", () => {
  it("names the strongest and the work-on pillar", () => {
    render(<PillarStandouts report={report()} />);
    expect(screen.getByText("Strongest pillar")).toBeTruthy();
    expect(screen.getByText("Protect the Goal")).toBeTruthy();
    expect(screen.getByText("Work-on pillar")).toBeTruthy();
    expect(screen.getByText("Protect the Air")).toBeTruthy();
  });
});

describe("FormStrip", () => {
  it("links every earlier report and marks this one", () => {
    const current = report();
    render(<FormStrip report={current} form={goalkeeperForm([current, earlier], current)} />);

    expect(
      screen
        .getByRole("link", { name: "Open the report for 30 Aug v Leeds United: 3.1" })
        .getAttribute("href"),
    ).toBe("/reports/$reportId:mr2_earlier");
    expect(screen.getByLabelText("This match, 9 Sept v Norwich City: 4.1")).toBeTruthy();
  });
});

describe("MentorVerdict", () => {
  it("attributes the comments to the mentor", () => {
    render(<MentorVerdict report={report()} />);
    expect(screen.getByText("A really solid performance.")).toBeTruthy();
    expect(screen.getByText("Andy Marshall")).toBeTruthy();
  });

  it("says so when there are no comments", () => {
    render(<MentorVerdict report={report({ comments: "" })} />);
    expect(screen.getByText("No comments recorded.")).toBeTruthy();
  });
});
