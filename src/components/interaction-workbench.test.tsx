// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { InteractionAudioClip, LoggedInteraction } from "@/lib/interactions/schema";

const audioState = vi.hoisted(() => ({
  current: {
    audioByInteraction: new Map<string, InteractionAudioClip[]>(),
    isLoading: false,
    isError: false,
  },
}));

vi.mock("@/lib/interactions/use-interactions", () => ({
  useInteractionAudioState: () => audioState.current,
}));

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

import { InteractionWorkbench } from "@/components/interaction-workbench";

const interactions: LoggedInteraction[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    gkSlug: "gk-christian-walton",
    goalkeeperName: "Christian Walton",
    playerId: "22222222-2222-4222-8222-222222222222",
    mentorId: "33333333-3333-4333-8333-333333333333",
    mentorName: "Martyn Margetson",
    interactionType: "Training Ground Visit",
    club: "Ipswich Town",
    occurredAt: "2026-08-20",
    notes: "Reviewed starting positions and the next distribution block.",
    outcome: "Action plan agreed",
    followUp: "Review the agreed actions next week.",
    createdAt: "2026-08-20T10:15:00.000Z",
    matchReportId: "report-123",
    calendarEventId: null,
    updatedAt: null,
    updatedBy: null,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    gkSlug: "gk-james-beadle",
    goalkeeperName: "James Beadle",
    playerId: "55555555-5555-4555-8555-555555555555",
    mentorId: "66666666-6666-4666-8666-666666666666",
    mentorName: "Matt Beadle",
    interactionType: "Phone Call",
    club: "Birmingham City",
    occurredAt: "2026-08-19",
    notes: "Second record notes about recovery and confidence.",
    outcome: "On track",
    followUp: "",
    createdAt: "2026-08-19T18:00:00.000Z",
    matchReportId: null,
    calendarEventId: "77777777-7777-4777-8777-777777777777",
    updatedAt: "2026-08-19T18:30:00.000Z",
    updatedBy: "66666666-6666-4666-8666-666666666666",
  },
];

function detailPanel(): HTMLElement {
  const panel = document.getElementById("selected-interaction-detail");
  if (!panel) throw new Error("Selected interaction detail panel was not rendered");
  return panel;
}

beforeEach(() => {
  audioState.current = {
    audioByInteraction: new Map<string, InteractionAudioClip[]>(),
    isLoading: false,
    isError: false,
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InteractionWorkbench", () => {
  it("uses the first interaction by default and switches complete read-only details in place", () => {
    render(
      <InteractionWorkbench interactions={interactions} periodLabel="2026-08-08 → 2026-08-21" />,
    );

    const first = screen.getByRole("button", {
      name: "Show details for Christian Walton on 20 Aug 2026",
    });
    const second = screen.getByRole("button", {
      name: "Show details for James Beadle on 19 Aug 2026",
    });
    expect(first.getAttribute("aria-pressed")).toBe("true");

    let detail = within(detailPanel());
    expect(detail.getByRole("heading", { name: "Christian Walton" })).toBeTruthy();
    expect(
      detail.getByText("Reviewed starting positions and the next distribution block."),
    ).toBeTruthy();
    expect(detail.getByText("Review the agreed actions next week.")).toBeTruthy();
    expect(detail.getByText("Action plan agreed")).toBeTruthy();
    expect(detail.getByText("Created from a Match Report")).toBeTruthy();
    expect(detail.getByRole("link", { name: /View source report/ }).getAttribute("href")).toBe(
      "/reports/report-123",
    );

    fireEvent.click(second);
    detail = within(detailPanel());
    expect(second.getAttribute("aria-pressed")).toBe("true");
    expect(detail.getByRole("heading", { name: "James Beadle" })).toBeTruthy();
    expect(detail.getByText("Second record notes about recovery and confidence.")).toBeTruthy();
    expect(detail.getByText("No follow-up action recorded.")).toBeTruthy();
    expect(detail.getByText("Logged for a scheduled event")).toBeTruthy();
    expect(detail.getByRole("link", { name: /Open calendar/ }).getAttribute("href")).toBe(
      "/calendar",
    );
  });

  it("filters by search, type and mentor while keeping a visible interaction selected", () => {
    render(
      <InteractionWorkbench interactions={interactions} periodLabel="2026-08-08 → 2026-08-21" />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Search interactions" }), {
      target: { value: "recovery" },
    });
    expect(screen.queryByRole("button", { name: /Show details for Christian Walton/ })).toBeNull();
    expect(within(detailPanel()).getByRole("heading", { name: "James Beadle" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by interaction type" }), {
      target: { value: "Training Ground Visit" },
    });
    expect(screen.getByRole("button", { name: /Show details for Christian Walton/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show details for James Beadle/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by mentor" }), {
      target: { value: "Matt Beadle" },
    });
    expect(screen.getByRole("button", { name: /Show details for James Beadle/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Show details for Christian Walton/ })).toBeNull();
  });

  it.each([
    {
      label: "loading",
      state: { audioByInteraction: new Map(), isLoading: true, isError: false },
      text: "Loading voice note…",
    },
    {
      label: "error",
      state: { audioByInteraction: new Map(), isLoading: false, isError: true },
      text: "We couldn’t load the voice note. Refresh the page to try again.",
    },
    {
      label: "empty",
      state: { audioByInteraction: new Map(), isLoading: false, isError: false },
      text: "No voice note attached.",
    },
  ])("shows the truthful $label voice-note state", ({ state, text }) => {
    audioState.current = state as typeof audioState.current;
    render(
      <InteractionWorkbench interactions={interactions} periodLabel="2026-08-08 → 2026-08-21" />,
    );
    expect(within(detailPanel()).getByText(text)).toBeTruthy();
  });

  it("renders playable and unavailable saved voice notes distinctly", () => {
    const clips: InteractionAudioClip[] = [
      {
        interactionId: interactions[0]!.id,
        mediaId: "88888888-8888-4888-8888-888888888888",
        title: "Session note",
        filePath: "voice/session.webm",
        mimeType: "audio/webm",
        fileSize: 1200,
        createdAt: "2026-08-20T10:20:00.000Z",
        signedUrl: "https://example.com/session.webm",
      },
      {
        interactionId: interactions[0]!.id,
        mediaId: "99999999-9999-4999-8999-999999999999",
        title: "Unavailable note",
        filePath: "voice/unavailable.webm",
        mimeType: "audio/webm",
        fileSize: 900,
        createdAt: "2026-08-20T10:21:00.000Z",
        signedUrl: null,
      },
    ];
    audioState.current = {
      audioByInteraction: new Map([[interactions[0]!.id, clips]]),
      isLoading: false,
      isError: false,
    };

    const { container } = render(
      <InteractionWorkbench interactions={interactions} periodLabel="2026-08-08 → 2026-08-21" />,
    );

    const audio = container.querySelector("audio");
    expect(audio?.getAttribute("src")).toBe("https://example.com/session.webm");
    expect(
      screen.getByText("Voice note saved, but playback is unavailable. Refresh to try again."),
    ).toBeTruthy();
  });
});
