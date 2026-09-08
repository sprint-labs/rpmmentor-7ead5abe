// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { PlayerRosterRow } from "@/lib/players.functions";
import type { TeamCalendarEvent } from "@/lib/calendar.functions";
import type { ActiveMentorInsightRow } from "@/lib/active-mentor-insights";
import { DUTY_LABELS, type Goalkeeper } from "@/lib/mock-data";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: ReactNode;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
    >
      {children}
    </a>
  ),
}));

import {
  ActiveMentorWorkbench,
  DutyOfCareWorkbench,
  PlayerRecordWorkbench,
  ScheduledEventWorkbench,
  type DutyRow,
} from "@/components/insight-drilldowns";

function panel(domId: string): HTMLElement {
  const found = document.getElementById(domId);
  if (!found) throw new Error(`${domId} was not rendered`);
  return found;
}

const players: PlayerRosterRow[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    full_name: "Christian Walton",
    current_club: "Ipswich Town",
    parent_club: "Brighton",
    on_loan: true,
    league: "EFL Championship",
    nationality: "England",
    instagram_url: null,
    contract_until: "2027-06-30",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    full_name: "James Beadle",
    current_club: "Birmingham City",
    parent_club: null,
    on_loan: false,
    league: "EFL League One",
    nationality: "England",
    instagram_url: null,
    contract_until: null,
  },
];

function goalkeeper(overrides: Partial<Goalkeeper> & Pick<Goalkeeper, "id" | "name">): Goalkeeper {
  return {
    initials: "",
    status: "Tier 2",
    tier: "Tier 2",
    tags: [],
    tierLevel: 2,
    region: "UK Based",
    mentorId: "mentor-1",
    club: "Ipswich Town",
    league: "EFL Championship",
    age: 29,
    dob: "1996-01-01",
    nationality: "England",
    contractUntil: "2027",
    height: null,
    shirtNumber: null,
    foot: null,
    lastInteraction: "2026-08-20",
    nextInteraction: "2026-09-20",
    rating: 3,
    potential: 3,
    recommendation: "Monitor",
    videoLinks: [],
    ...overrides,
  } as Goalkeeper;
}

const dutyRows: DutyRow[] = [
  {
    gk: goalkeeper({ id: "gk-overdue", name: "Overdue Keeper" }),
    duty: { level: "overdue", label: DUTY_LABELS.overdue, days: 45 },
  },
  {
    gk: goalkeeper({ id: "gk-fine", name: "Recent Keeper", club: "Derby County" }),
    duty: { level: "up_to_date", label: DUTY_LABELS.up_to_date, days: 4 },
  },
];

const mentors: ActiveMentorInsightRow[] = [
  {
    id: "mentor-active",
    name: "Martyn Margetson",
    isManager: true,
    firstName: "Martyn",
    lastName: "Margetson",
    interactionsLogged: 12,
    matchReportsSubmitted: 5,
  },
  {
    id: "mentor-silent",
    name: "Quiet Mentor",
    isManager: false,
    firstName: "Quiet",
    lastName: "Mentor",
    interactionsLogged: 0,
    matchReportsSubmitted: 0,
  },
];

function calendarEvent(overrides: Partial<TeamCalendarEvent>): TeamCalendarEvent {
  return {
    id: "event-1",
    title: "Training visit",
    event_type: "Training",
    event_date: "2099-01-01",
    start_time: "10:30:00",
    end_time: null,
    location: "Playford Road",
    notes: "",
    participation_status: "unknown" as TeamCalendarEvent["participation_status"],
    player_id: null,
    goalkeeper_name: "Christian Walton",
    assigned_mentor_id: null,
    assigned_mentor_name: "Martyn Margetson",
    status: "scheduled",
    cancellation_reason: "",
    follow_up_waived_at: null,
    follow_up_waiver_reason: "",
    created_by: "user-1",
    created_by_name: "Manager",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlayerRecordWorkbench", () => {
  it("shows the full record and flags a loan in the list", () => {
    render(<PlayerRecordWorkbench players={players} />);

    const detail = within(panel("selected-player-detail"));
    expect(detail.getByRole("heading", { name: "Christian Walton" })).toBeTruthy();
    expect(detail.getByText("On loan from Brighton")).toBeTruthy();
    expect(detail.getByRole("link", { name: /Open player record/ }).getAttribute("href")).toBe(
      "/system/players/11111111-1111-4111-8111-111111111111",
    );

    const row = screen.getByRole("button", { name: "Show details for Christian Walton" });
    expect(within(row).getByText("On loan from Brighton").className).toContain("text-warning");
  });

  it("filters by league and keeps a visible record selected", () => {
    render(<PlayerRecordWorkbench players={players} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Filter by league" }), {
      target: { value: "EFL League One" },
    });
    expect(screen.queryByRole("button", { name: /Christian Walton/ })).toBeNull();
    expect(
      within(panel("selected-player-detail")).getByRole("heading", { name: "James Beadle" }),
    ).toBeTruthy();
  });
});

describe("DutyOfCareWorkbench", () => {
  it("opens on the band deep-linked from the dashboard", () => {
    render(<DutyOfCareWorkbench rows={dutyRows} initialLevel="overdue" />);

    expect(screen.getByRole("button", { name: "Show details for Overdue Keeper" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show details for Recent Keeper" })).toBeNull();
    expect(
      within(panel("selected-duty-detail")).getByRole("heading", { name: "Overdue Keeper" }),
    ).toBeTruthy();
  });

  it("shows every band when no level is deep-linked and highlights the overdue row", () => {
    render(<DutyOfCareWorkbench rows={dutyRows} />);

    expect(screen.getByRole("button", { name: "Show details for Recent Keeper" })).toBeTruthy();
    const overdueRow = screen.getByRole("button", { name: "Show details for Overdue Keeper" });
    expect(within(overdueRow).getByText("Overdue · 45d").className).toContain("text-warning");
  });
});

describe("ActiveMentorWorkbench", () => {
  it("flags a mentor with nothing recorded rather than hiding them", () => {
    render(<ActiveMentorWorkbench mentors={mentors} />);

    const silentRow = screen.getByRole("button", { name: "Show details for Quiet Mentor" });
    expect(within(silentRow).getByText("Nothing recorded yet").className).toContain("text-warning");

    fireEvent.click(silentRow);
    const detail = within(panel("selected-mentor-detail"));
    expect(detail.getByRole("heading", { name: "Quiet Mentor" })).toBeTruthy();
    expect(detail.getByText("Nothing recorded yet")).toBeTruthy();
  });
});

describe("ScheduledEventWorkbench", () => {
  it("highlights an event happening today and leaves later ones muted", () => {
    const today = new Date().toISOString().slice(0, 10);
    render(
      <ScheduledEventWorkbench
        events={[
          calendarEvent({ id: "today", title: "Today session", event_date: today }),
          calendarEvent({ id: "later", title: "Later session", event_date: "2099-01-01" }),
        ]}
      />,
    );

    const todayRow = screen.getByRole("button", { name: /Show details for Today session/ });
    const laterRow = screen.getByRole("button", { name: /Show details for Later session/ });
    expect(within(todayRow).getByText("Today").className).toContain("text-warning");
    expect(within(laterRow).getByText("Playford Road").className).toContain(
      "text-muted-foreground",
    );

    expect(
      within(panel("selected-event-detail")).getByRole("heading", { name: "Today session" }),
    ).toBeTruthy();
  });
});
