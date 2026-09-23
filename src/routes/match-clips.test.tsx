// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamCalendarEvent } from "@/lib/calendar.functions";
import { todayDateOnly } from "@/lib/interactions/schema";
import { matchLabel, shiftDateOnly } from "@/lib/match-clips";
import type { MediaAsset } from "@/lib/media-store";

const { listMatchClipsMock, listPlayersMock, listEventsMock } = vi.hoisted(() => ({
  listMatchClipsMock: vi.fn(),
  listPlayersMock: vi.fn(),
  listEventsMock: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "u1",
      name: "David Rouse",
      email: "d@example.com",
      role: "mentor_manager",
      initials: "DR",
      title: "Mentor",
    },
    can: (permission: string) => permission === "media.view" || permission === "media.upload",
  }),
}));

vi.mock("@/lib/players.functions", () => ({
  listPlayers: () => listPlayersMock(),
}));

vi.mock("@/lib/calendar.functions", () => ({
  listCalendarEvents: () => listEventsMock(),
}));

vi.mock("@/lib/media-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media-store")>();
  return {
    ...actual,
    listMatchClips: (...args: unknown[]) => listMatchClipsMock(...args),
  };
});

vi.mock("@/components/workflows", () => ({
  EditMediaDialog: () => null,
}));

const { Route } = await import("./match-clips");

const TODAY = todayDateOnly();
const Page = Route.options.component;

function event(overrides: Partial<TeamCalendarEvent>): TeamCalendarEvent {
  return {
    id: "event",
    title: "Northern FC v Eastern Town",
    event_type: "Match",
    event_date: shiftDateOnly(TODAY, 1),
    start_time: null,
    end_time: null,
    location: null,
    notes: "",
    participation_status: "not_confirmed",
    player_id: null,
    goalkeeper_name: "Zoe Keeper",
    assigned_mentor_id: null,
    assigned_mentor_name: "",
    status: "scheduled",
    cancellation_reason: "",
    follow_up_waived_at: null,
    follow_up_waiver_reason: "",
    created_by: "u1",
    created_by_name: "Manager",
    ...overrides,
  };
}

function clip(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: "clip-1",
    gk_id: null,
    title: "save.mp4",
    notes: null,
    media_type: "video",
    mime_type: "video/mp4",
    file_path: "loose/save.mp4",
    file_size: 1024,
    thumbnail_path: null,
    rating_tags: [],
    uploaded_by_id: "u1",
    uploaded_by_name: "David Rouse",
    uploaded_by_role: "mentor_manager",
    created_at: "2026-09-20T10:00:00.000Z",
    updated_at: "2026-09-20T10:00:00.000Z",
    asset_purpose: "match_clip",
    match_event_id: "match-played",
    upload_batch_id: "batch-1",
    ...overrides,
  };
}

const PLAYED = event({ id: "match-played", title: "Played FC v Away" });
const CANCELLED = event({
  id: "match-cancelled",
  title: "Cancelled FC v Away",
  status: "cancelled",
});
const FUTURE = event({
  id: "match-future",
  title: "Future FC v Away",
  event_date: shiftDateOnly(TODAY, -3),
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (!Page) throw new Error("Match Clips page is missing");
  const view = render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

async function clipsHaveLoaded(client: QueryClient) {
  await waitFor(() => {
    const queries = client.getQueryCache().findAll({ queryKey: ["match-clips"] });
    expect(queries.some((query) => query.state.status === "success")).toBe(true);
  });
}

beforeEach(() => {
  listMatchClipsMock.mockReset();
  listPlayersMock.mockReset();
  listEventsMock.mockReset();
  listPlayersMock.mockResolvedValue([]);
  listMatchClipsMock.mockResolvedValue([clip()]);
  listEventsMock.mockReturnValue(new Promise(() => {}));
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Match Clips page", () => {
  it("does not treat linked clips as deleted matches before the calendar loads", async () => {
    let resolveEvents: (events: TeamCalendarEvent[]) => void = () => {};
    listEventsMock.mockReturnValue(
      new Promise<TeamCalendarEvent[]>((resolve) => {
        resolveEvents = resolve;
      }),
    );
    const { client } = renderPage();

    await clipsHaveLoaded(client);
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByText("Match no longer in the calendar")).toBeNull();

    fireEvent.change(screen.getByLabelText("Match date from"), {
      target: { value: PLAYED.event_date },
    });
    fireEvent.change(screen.getByLabelText("to"), { target: { value: PLAYED.event_date } });
    expect(screen.queryByText("No match clips match these filters")).toBeNull();

    resolveEvents([PLAYED]);
    expect(await screen.findByRole("heading", { level: 2, name: matchLabel(PLAYED) })).toBeTruthy();
    expect(screen.queryByText("Match no longer in the calendar")).toBeNull();
  });

  it("shows an error when the calendar read fails instead of orphaning every clip", async () => {
    listEventsMock.mockRejectedValue(new Error("calendar down"));
    const { client } = renderPage();

    await clipsHaveLoaded(client);
    expect(await screen.findByText("Matches could not be loaded")).toBeTruthy();
    expect(screen.getByText("Matches could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("Match no longer in the calendar")).toBeNull();

    fireEvent.change(screen.getByLabelText("Match date from"), {
      target: { value: PLAYED.event_date },
    });
    expect(screen.queryByText("No match clips match these filters")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("still says when a fixture is gone after the calendar has loaded", async () => {
    listEventsMock.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Match no longer in the calendar" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add clips" })).toBeNull();
  });

  it("offers Add clips only for a match the uploader can select", async () => {
    listEventsMock.mockResolvedValue([PLAYED, CANCELLED, FUTURE]);
    listMatchClipsMock.mockResolvedValue([
      clip({ id: "played-clip", match_event_id: PLAYED.id }),
      clip({ id: "cancelled-clip", match_event_id: CANCELLED.id }),
      clip({ id: "future-clip", match_event_id: FUTURE.id }),
    ]);
    renderPage();

    const played = await screen.findByRole("region", { name: matchLabel(PLAYED) });
    const cancelled = await screen.findByRole("region", { name: matchLabel(CANCELLED) });
    const future = await screen.findByRole("region", { name: matchLabel(FUTURE) });
    expect(within(played).getByRole("button", { name: "Add clips" })).toBeTruthy();
    expect(within(cancelled).queryByRole("button", { name: "Add clips" })).toBeNull();
    expect(within(future).queryByRole("button", { name: "Add clips" })).toBeNull();

    fireEvent.click(within(played).getByRole("button", { name: "Add clips" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Match" }).textContent).toContain(
        "Played FC v Away",
      ),
    );
  });
});
