// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentType, ReactNode } from "react";
import type { MatchReportRow } from "@/lib/match-reports/schema";

const REPORT: MatchReportRow = {
  report_id: "mr2_demo",
  legacy_report_id: null,
  row_index: 1,
  goalkeeper: "Demo Keeper",
  coach: "Demo Mentor",
  team: "Roster FC",
  opponent: "Visitors FC",
  competition: "Demo League",
  match_date: "2026-09-20",
  scores: {
    protect_goal: 4,
    protect_space: 3,
    protect_air: 3,
    control_play: 4,
    change_play: 3,
    psych: 4,
    physical: 3,
  },
  average: 3.4,
  comments: "Commanding in the box and calm with the ball at his feet all afternoon.",
} as MatchReportRow;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ reportId: "mr2_demo" }),
  }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useRouter: () => ({ history: { back: vi.fn() }, navigate: vi.fn(), invalidate: vi.fn() }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "user-1", roles: ["mentor_manager"] }, can: () => true }),
}));

vi.mock("@/lib/match-reports/reports.functions", () => ({
  getMatchReport: vi.fn(async () => ({ report: REPORT })),
  listMatchReports: vi.fn(async () => ({ reports: [REPORT] })),
  deleteMatchReport: vi.fn(),
}));

vi.mock("@/lib/match-reports/report-edit-access.functions", () => ({
  getMatchReportEditAccess: vi.fn(async () => ({ canEdit: true, isAuthor: false })),
  updateOwnedMatchReport: vi.fn(),
}));

vi.mock("@/lib/players.functions", () => ({
  listPlayers: vi.fn(async () => []),
}));

vi.mock("@/lib/media-store", () => ({
  listReportAttachmentsForIds: vi.fn(async () => []),
  openAsset: vi.fn(),
}));

vi.mock("@/lib/query-refresh", () => ({
  refreshInteractionViews: vi.fn(async () => undefined),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const { Route } = await import("./reports.$reportId");
const ReportDetail = (Route as unknown as { component: ComponentType }).component;

afterEach(() => {
  cleanup();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportDetail />
    </QueryClientProvider>,
  );
}

describe("Report editor rating scale", () => {
  it("lists RPM's rating system and reads each score's meaning on its button", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Edit report/ }));

    const editor = screen.getByText("Edit Match Report").closest("form");
    expect(editor).toBeTruthy();
    const form = within(editor!);

    const scale = form.getByRole("group", { name: "Rating scale" });
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

    const pillar = form.getByRole("group", { name: "Protect the Goal score" });
    const picked = within(pillar).getByRole("button", {
      name: "4: Performing at top of current level",
    });
    expect(picked.getAttribute("aria-pressed")).toBe("true");
    expect(picked.getAttribute("title")).toBe("4: Performing at top of current level");

    const concern = within(pillar).getByRole("button", { name: "1: Cause for concern" });
    fireEvent.click(concern);
    await waitFor(() => expect(concern.getAttribute("aria-pressed")).toBe("true"));
    expect(picked.getAttribute("aria-pressed")).toBe("false");
  });
});
