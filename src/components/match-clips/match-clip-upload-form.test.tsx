// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TeamCalendarEvent } from "@/lib/calendar.functions";
import { todayDateOnly } from "@/lib/interactions/schema";
import { shiftDateOnly } from "@/lib/match-clips";
import type { PlayerRosterRow } from "@/lib/players.functions";

const uploadMediaMock = vi.fn();
const listPlayersMock = vi.fn();
const listEventsMock = vi.fn();
const onDoneMock = vi.fn();

const ZOE = "11111111-1111-4111-8111-111111111111";
const ALEX = "22222222-2222-4222-8222-222222222222";

function player(id: string, full_name: string, current_club: string): PlayerRosterRow {
  return {
    id,
    full_name,
    current_club,
    parent_club: null,
    on_loan: false,
    league: "Championship",
    nationality: "England",
    instagram_url: null,
    contract_until: null,
    tier: null,
    is_academy: false,
    is_free_agent: false,
  };
}

const PLAYERS = [
  player(ZOE, "Zoe Keeper", "Northern FC"),
  player(ALEX, "Alex Goalkeeper", "Southern United"),
];

const TODAY = todayDateOnly();

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
    player_id: ZOE,
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

const ZOE_MATCH = event({ id: "match-zoe" });
const ALEX_MATCH = event({
  id: "match-alex",
  title: "Southern United v Western Rovers",
  event_date: shiftDateOnly(TODAY, 20),
  player_id: ALEX,
  goalkeeper_name: "Alex Goalkeeper",
});

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["middleware"] = () => chain;
    chain["validator"] = () => chain;
    chain["inputValidator"] = () => chain;
    chain["handler"] = (fn: unknown) => fn;
    return chain;
  },
  createMiddleware: () => {
    const chain: Record<string, unknown> = {};
    chain["server"] = () => chain;
    chain["client"] = () => chain;
    return chain;
  },
}));

vi.mock("@/lib/media-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media-store")>()),
  uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
}));

vi.mock("@/lib/players.functions", () => ({
  listPlayers: () => listPlayersMock(),
}));

vi.mock("@/lib/calendar.functions", () => ({
  listCalendarEvents: () => listEventsMock(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "David Rouse", role: "mentor_manager" },
    can: () => true,
  }),
}));

const { MatchClipUploadForm } = await import("./match-clip-upload-form");

function renderForm(prefillMatchId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MatchClipUploadForm onDone={onDoneMock} prefillMatchId={prefillMatchId} />
    </QueryClientProvider>,
  );
}

function clip(name: string): File {
  return new File(["clip-bytes"], name, { type: "video/mp4" });
}

function chooseClips(files: File[]) {
  fireEvent.change(screen.getByLabelText("Clips"), { target: { files } });
}

interface UploadCall {
  file: File;
  gkId: string | null;
  title: string;
  matchClip: { matchEventId: string | null; uploadBatchId: string };
}

function uploadCalls(): UploadCall[] {
  return uploadMediaMock.mock.calls.map(([options]) => options as UploadCall);
}

beforeEach(() => {
  uploadMediaMock.mockReset();
  uploadMediaMock.mockImplementation(async ({ file }: { file: File }) => ({ id: file.name }));
  listPlayersMock.mockReset();
  listPlayersMock.mockResolvedValue(PLAYERS);
  listEventsMock.mockReset();
  listEventsMock.mockResolvedValue([
    ZOE_MATCH,
    ALEX_MATCH,
    event({ id: "future", event_date: shiftDateOnly(TODAY, -3) }),
    event({ id: "cancelled", status: "cancelled" }),
  ]);
  onDoneMock.mockReset();
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

async function waitForMatches() {
  await waitFor(() =>
    expect((screen.getByRole("combobox", { name: "Match" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
}

describe("MatchClipUploadForm", () => {
  it("sends every clip to the chosen match, its goalkeeper and one shared batch", async () => {
    renderForm(ZOE_MATCH.id);
    await waitForMatches();
    expect(screen.getByRole("combobox", { name: "Match" }).textContent).toContain(
      "Northern FC v Eastern Town",
    );
    await waitFor(() => expect(screen.getByText("Zoe Keeper")).toBeTruthy());

    chooseClips([clip("save-1.mp4"), clip("save-2.mp4")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload 2 clips" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(2));
    const calls = uploadCalls();
    expect(calls.map((call) => call.title)).toEqual(["save-1.mp4", "save-2.mp4"]);
    expect(calls.map((call) => call.gkId)).toEqual([ZOE, ZOE]);
    expect(calls.map((call) => call.matchClip.matchEventId)).toEqual([ZOE_MATCH.id, ZOE_MATCH.id]);
    expect(calls[0]!.matchClip.uploadBatchId).toBeTruthy();
    expect(calls[1]!.matchClip.uploadBatchId).toBe(calls[0]!.matchClip.uploadBatchId);
    await waitFor(() => expect(screen.getByText("2 clips uploaded to Match Clips.")).toBeTruthy());
  });

  it("lets one clip go to another goalkeeper's match, or to no match", async () => {
    renderForm(ZOE_MATCH.id);
    await waitForMatches();

    chooseClips([clip("zoe.mp4"), clip("alex.mp4"), clip("unknown.mp4")]);
    fireEvent.change(screen.getByLabelText("Match for alex.mp4"), {
      target: { value: ALEX_MATCH.id },
    });
    fireEvent.change(screen.getByLabelText("Match for unknown.mp4"), {
      target: { value: "__none__" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload 3 clips" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(3));
    const byTitle = new Map(uploadCalls().map((call) => [call.title, call]));
    expect(byTitle.get("zoe.mp4")).toMatchObject({
      gkId: ZOE,
      matchClip: { matchEventId: ZOE_MATCH.id },
    });
    expect(byTitle.get("alex.mp4")).toMatchObject({
      gkId: ALEX,
      matchClip: { matchEventId: ALEX_MATCH.id },
    });
    // No match keeps the batch's goalkeeper rather than dropping the link.
    expect(byTitle.get("unknown.mp4")).toMatchObject({
      gkId: ZOE,
      matchClip: { matchEventId: null },
    });
  });

  it("offers only played, uncancelled matches", async () => {
    renderForm(null);
    await waitForMatches();
    chooseClips([clip("one.mp4")]);

    const options = Array.from(
      (screen.getByLabelText("Match for one.mp4") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(options).toEqual(["", "__none__", ZOE_MATCH.id, ALEX_MATCH.id]);
  });

  it("uploads unmatched clips against the goalkeeper picked by hand", async () => {
    renderForm(null);
    await waitForMatches();
    expect(screen.getByRole("combobox", { name: "Match" }).textContent).toContain("No match yet");

    chooseClips([clip("loose.mp4")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload 1 clip" }));

    await waitFor(() => expect(uploadMediaMock).toHaveBeenCalledTimes(1));
    expect(uploadCalls()[0]).toMatchObject({ gkId: null, matchClip: { matchEventId: null } });
  });

  it("does not upload until the matches have loaded", async () => {
    listEventsMock.mockReturnValue(new Promise(() => {}));
    renderForm(ZOE_MATCH.id);
    chooseClips([clip("early.mp4")]);

    const upload = screen.getByRole("button", { name: "Upload 1 clip" }) as HTMLButtonElement;
    expect(upload.disabled).toBe(true);
    fireEvent.click(upload);
    expect(uploadMediaMock).not.toHaveBeenCalled();
  });
});
