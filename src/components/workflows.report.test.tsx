// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const mocks = vi.hoisted(() => ({
  submitMatchReport: vi.fn(),
  listPlayers: vi.fn(),
  loadDraft: vi.fn(),
  saveDraft: vi.fn(),
  overwriteDraft: vi.fn(),
  clearDraft: vi.fn(),
  subscribeDraftChanges: vi.fn(),
  newTabId: vi.fn(),
  newSubmissionKey: vi.fn(),
  refreshInteractionViews: vi.fn(),
  enqueueJob: vi.fn(),
  attachMediaToReport: vi.fn(),
  listMedia: vi.fn(),
  getMediaByIds: vi.fn(),
  getSignedUrl: vi.fn(),
  uploadMedia: vi.fn(),
  updateMedia: vi.fn(),
  navigate: vi.fn(),
}));

const USER = { id: "user-1", name: "Mentor One", roles: ["mentor"] };
const TEST_PLAYER = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Demo Keeper",
  current_club: "Roster FC",
  league: "EFL Championship",
};
const DEFAULT_SCORES = {
  protect_goal: 3,
  protect_space: 3,
  protect_air: 3,
  control_play: 3,
  change_play: 3,
  psych: 3,
  physical: 3,
};
const VALID_COMMENTS =
  "He managed the box well, communicated clearly and made two important saves after the break.";

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

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: USER, can: () => true }),
}));

vi.mock("@/lib/mock-data", () => ({
  goalkeepers: [
    {
      id: "gk-1",
      name: "James Beadle",
      club: "Birmingham City",
      league: "EFL Championship",
    },
  ],
}));

vi.mock("@/lib/competitions", () => ({
  COMPETITIONS: ["EFL Championship", "Premier League"],
}));

vi.mock("@/lib/players.functions", () => ({
  listPlayers: (...args: unknown[]) => mocks.listPlayers(...args),
}));

vi.mock("@/lib/match-reports/reports.functions", () => ({
  submitMatchReport: (...args: unknown[]) => mocks.submitMatchReport(...args),
}));

vi.mock("@/lib/match-reports/draft-store", () => ({
  loadDraft: (...args: unknown[]) => mocks.loadDraft(...args),
  saveDraft: (...args: unknown[]) => mocks.saveDraft(...args),
  overwriteDraft: (...args: unknown[]) => mocks.overwriteDraft(...args),
  clearDraft: (...args: unknown[]) => mocks.clearDraft(...args),
  subscribeDraftChanges: (...args: unknown[]) => mocks.subscribeDraftChanges(...args),
  newTabId: (...args: unknown[]) => mocks.newTabId(...args),
  isDraftMeaningful: (draft: {
    goalkeeper: string;
    team: string;
    opponent: string;
    comments: string;
    selectedMedia: string[];
    scores: Record<string, number>;
  }) =>
    Boolean(
      draft.goalkeeper.trim() ||
      draft.team.trim() ||
      draft.opponent.trim() ||
      draft.comments.trim() ||
      draft.selectedMedia.length > 0 ||
      Object.values(draft.scores).some((score) => score !== 3),
    ),
}));

vi.mock("@/lib/match-reports/duplicates", () => ({
  newSubmissionKey: (...args: unknown[]) => mocks.newSubmissionKey(...args),
}));

vi.mock("@/lib/query-refresh", () => ({
  refreshInteractionViews: (...args: unknown[]) => mocks.refreshInteractionViews(...args),
}));

vi.mock("@/lib/sync/queue", () => ({
  enqueueJob: (...args: unknown[]) => mocks.enqueueJob(...args),
}));

vi.mock("@/lib/media-store", () => ({
  ACCEPT_BY_KIND: {
    video: "video/*",
    pdf: "application/pdf",
    image: "image/*",
    audio: "audio/*",
  },
  MAX_FILE_BYTES: 50 * 1024 * 1024,
  detectKind: vi.fn(() => "image"),
  formatBytes: vi.fn((bytes: number) => `${bytes} bytes`),
  formatFileLimit: vi.fn((bytes: number) => `${bytes} bytes`),
  buildObjectPath: vi.fn(() => "unlinked/test"),
  uploadMedia: (...args: unknown[]) => mocks.uploadMedia(...args),
  updateMedia: (...args: unknown[]) => mocks.updateMedia(...args),
  listMedia: (...args: unknown[]) => mocks.listMedia(...args),
  attachMediaToReport: (...args: unknown[]) => mocks.attachMediaToReport(...args),
  getMediaByIds: (...args: unknown[]) => mocks.getMediaByIds(...args),
  getSignedUrl: (...args: unknown[]) => mocks.getSignedUrl(...args),
  RATING_TAG_OPTIONS: [],
}));

vi.mock("@/lib/interactions.functions", () => ({
  createInteraction: vi.fn(),
  updateInteraction: vi.fn(),
  attachInteractionAudio: vi.fn(),
}));

vi.mock("@/lib/interactions/audio", () => ({
  interactionAudioFileName: vi.fn(() => "interaction.webm"),
  interactionAudioNotes: vi.fn(() => "Interaction audio"),
  interactionAudioTitle: vi.fn(() => "Interaction audio"),
  persistInteractionAudio: vi.fn(),
}));

vi.mock("@/lib/interactions/use-interactions", () => ({
  interactionsQueryKey: ["interactions"],
}));

vi.mock("@/lib/interactions/map", () => ({
  reconcileInteraction: (_current: unknown, _optimisticId: string, saved: unknown) => [saved],
}));

vi.mock("@/lib/interactions/draft-store", () => ({
  loadInteractionDraft: vi.fn(() => null),
  saveInteractionDraft: vi.fn(),
  clearInteractionDraft: vi.fn(),
}));

vi.mock("@/lib/media-upload-batch", () => ({
  createMediaUploadItems: vi.fn(() => []),
  retryFailedMediaUploads: vi.fn(async (items: unknown[]) => items),
  runMediaUploadBatch: vi.fn(async (items: unknown[]) => items),
}));

vi.mock("@/components/handwritten-notes-field", () => ({
  HandwrittenNotesField: () => null,
}));

vi.mock("@/components/voice-note-field", () => ({
  VoiceNoteField: () => null,
}));

vi.mock("@/components/goalkeeper-picker", () => ({
  GoalkeeperPicker: () => null,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
  },
}));

const { WorkflowDialog } = await import("./workflows");

type ReportDialogProps = {
  prefillGoalkeeper?: string;
  prefillMatchDate?: string;
  prefillOpponent?: string;
  followUpEventId?: string;
};

function renderReport(props: ReportDialogProps = {}) {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <WorkflowDialog kind="report" onClose={onClose} {...props} />
    </QueryClientProvider>,
  );
  return { ...view, client, onClose };
}

async function fillReport(comments = VALID_COMMENTS) {
  await waitFor(() => expect(mocks.loadDraft).toHaveBeenCalledWith(USER.id));

  fireEvent.change(screen.getByPlaceholderText("e.g. James Beadle"), {
    target: { value: "James Beadle" },
  });
  fireEvent.change(screen.getByPlaceholderText("e.g. EFL Championship"), {
    target: { value: "EFL Championship" },
  });
  fireEvent.change(screen.getByPlaceholderText("e.g. Wolves"), {
    target: { value: "Birmingham City" },
  });
  fireEvent.change(screen.getByPlaceholderText("e.g. Blackburn Rovers"), {
    target: { value: "Blackburn Rovers" },
  });
  const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement | null;
  expect(dateInput).toBeTruthy();
  fireEvent.change(dateInput!, { target: { value: "2026-01-05" } });
  fireEvent.change(screen.getByPlaceholderText(/Write the mentor's match observations/i), {
    target: { value: comments },
  });
}

function successfulResponse() {
  return {
    status: "submitted",
    report_id: "report-123",
    average: 4,
    interaction_error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });

  mocks.listPlayers.mockResolvedValue([TEST_PLAYER]);
  mocks.loadDraft.mockReturnValue(null);
  mocks.saveDraft.mockReturnValue({
    ok: true,
    savedAt: "2026-08-21T01:00:00.000Z",
    version: 1,
  });
  mocks.overwriteDraft.mockReturnValue({
    ok: true,
    savedAt: "2026-08-21T01:00:00.000Z",
    version: 2,
  });
  mocks.subscribeDraftChanges.mockReturnValue(() => undefined);
  mocks.newTabId.mockReturnValue("tab-test");
  mocks.newSubmissionKey.mockReturnValue("submission-key-1");
  mocks.refreshInteractionViews.mockResolvedValue(undefined);
  mocks.listMedia.mockResolvedValue([]);
  mocks.getMediaByIds.mockResolvedValue([]);
  mocks.getSignedUrl.mockResolvedValue(null);
  mocks.attachMediaToReport.mockResolvedValue(undefined);
  mocks.enqueueJob.mockReturnValue({ id: "queued-1" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Match Report form", () => {
  it("opens as a labelled modal, moves focus inside and closes on Escape", async () => {
    const opener = document.createElement("button");
    opener.textContent = "Open report";
    document.body.append(opener);
    opener.focus();

    const onClose = vi.fn();
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    function ClosableReport() {
      const [kind, setKind] = useState<"report" | null>("report");
      return (
        <WorkflowDialog
          kind={kind}
          onClose={() => {
            onClose();
            setKind(null);
          }}
        />
      );
    }

    render(
      <QueryClientProvider client={client}>
        <ClosableReport />
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Submit Report" });

    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.activeElement).toBe(opener));
    opener.remove();
  });

  it("blocks short comments, explains the requirement and keeps the entered report", async () => {
    renderReport();
    await fillReport("Too short to be a meaningful report.");

    fireEvent.click(screen.getByRole("button", { name: "Submit Match Report" }));

    expect(
      await screen.findByText("Comments need at least 40 characters of match detail."),
    ).toBeTruthy();
    expect(mocks.submitMatchReport).not.toHaveBeenCalled();
    expect(
      (screen.getByPlaceholderText(/Write the mentor's match observations/i) as HTMLTextAreaElement)
        .value,
    ).toBe("Too short to be a meaningful report.");
  });

  it("restores a persisted draft on mount without trusting its stale coach value", async () => {
    mocks.loadDraft.mockReturnValue({
      goalkeeper: "Restored Keeper",
      coach: "Old Coach Name",
      competition: "Premier League",
      team: "Restored FC",
      opponent: "Other United",
      matchDate: "2026-01-03",
      scores: { ...DEFAULT_SCORES, protect_goal: 4 },
      comments: "Restored observations that are long enough to remain available for editing.",
      selectedMedia: [],
      voiceTranscript: null,
      version: 3,
      tabId: "other-tab",
      savedAt: "2026-08-20T20:30:00.000Z",
    });

    renderReport();

    await waitFor(() =>
      expect((screen.getByPlaceholderText("e.g. James Beadle") as HTMLInputElement).value).toBe(
        "Restored Keeper",
      ),
    );
    expect((screen.getByPlaceholderText("e.g. EFL Championship") as HTMLInputElement).value).toBe(
      "Premier League",
    );
    expect((screen.getByPlaceholderText("e.g. Wolves") as HTMLInputElement).value).toBe(
      "Restored FC",
    );
    expect((screen.getByPlaceholderText("e.g. Blackburn Rovers") as HTMLInputElement).value).toBe(
      "Other United",
    );
    expect(
      (screen.getByPlaceholderText(/Write the mentor's match observations/i) as HTMLTextAreaElement)
        .value,
    ).toContain("Restored observations");
    expect(screen.getByDisplayValue("Mentor One")).toBeTruthy();
    expect(screen.queryByDisplayValue("Old Coach Name")).toBeNull();
    expect(screen.getByText(/Draft restored from/i)).toBeTruthy();
  });

  it("requires explicit duplicate confirmation and reuses the same idempotency key", async () => {
    mocks.submitMatchReport
      .mockResolvedValueOnce({
        status: "duplicate",
        window: "strong",
        message: "A report already exists for this fixture.",
      })
      .mockResolvedValueOnce(successfulResponse());

    renderReport({ followUpEventId: "event-123" });
    await fillReport();
    fireEvent.click(screen.getByRole("button", { name: "Submit Match Report" }));

    await waitFor(() => expect(mocks.submitMatchReport).toHaveBeenCalledTimes(1));
    const first = mocks.submitMatchReport.mock.calls[0]![0] as {
      data: { options: Record<string, unknown> };
    };
    expect(first.data.options).toMatchObject({
      allowDuplicate: false,
      replay: false,
      submissionKey: "submission-key-1",
      calendarEventId: "event-123",
    });
    expect(await screen.findByText("Possible double submission")).toBeTruthy();
    expect(screen.getByText(/Nothing has been written/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Submit duplicate anyway" }));

    await waitFor(() => expect(mocks.submitMatchReport).toHaveBeenCalledTimes(2));
    const second = mocks.submitMatchReport.mock.calls[1]![0] as {
      data: { options: Record<string, unknown> };
    };
    expect(second.data.options).toMatchObject({
      allowDuplicate: true,
      replay: false,
      submissionKey: "submission-key-1",
      calendarEventId: "event-123",
    });
    expect(await screen.findByText(/Match report submitted.*Average 4\.0/i)).toBeTruthy();
    expect(mocks.clearDraft).toHaveBeenCalledWith(USER.id);
    expect(mocks.refreshInteractionViews).toHaveBeenCalledTimes(1);
  });

  it("keeps every value after a non-transient failure and permits a safe retry", async () => {
    mocks.submitMatchReport
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockResolvedValueOnce(successfulResponse());

    renderReport();
    await fillReport();
    fireEvent.click(screen.getByRole("button", { name: "Submit Match Report" }));

    expect(await screen.findByText("permission denied")).toBeTruthy();
    expect((screen.getByPlaceholderText("e.g. James Beadle") as HTMLInputElement).value).toBe(
      "James Beadle",
    );
    expect((screen.getByPlaceholderText("e.g. Wolves") as HTMLInputElement).value).toBe(
      "Birmingham City",
    );
    expect(
      (screen.getByPlaceholderText(/Write the mentor's match observations/i) as HTMLTextAreaElement)
        .value,
    ).toBe(VALID_COMMENTS);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.enqueueJob).not.toHaveBeenCalled();

    const submitButton = screen.getByRole("button", {
      name: "Submit Match Report",
    }) as HTMLButtonElement;
    await waitFor(() => expect(submitButton.disabled).toBe(false));
    fireEvent.click(submitButton);

    await waitFor(() => expect(mocks.submitMatchReport).toHaveBeenCalledTimes(2));
    const firstKey = (
      mocks.submitMatchReport.mock.calls[0]![0] as {
        data: { options: { submissionKey: string } };
      }
    ).data.options.submissionKey;
    const secondKey = (
      mocks.submitMatchReport.mock.calls[1]![0] as {
        data: { options: { submissionKey: string } };
      }
    ).data.options.submissionKey;
    expect(firstKey).toBe("submission-key-1");
    expect(secondKey).toBe(firstKey);
    expect(await screen.findByText(/Match report submitted.*Average 4\.0/i)).toBeTruthy();
  });

  it("queues a network failure locally with the complete payload and clears the saved draft", async () => {
    mocks.submitMatchReport.mockRejectedValueOnce(new Error("Failed to fetch"));

    renderReport();
    await fillReport();
    fireEvent.click(screen.getByRole("button", { name: "Submit Match Report" }));

    await waitFor(() => expect(mocks.enqueueJob).toHaveBeenCalledTimes(1));
    expect(mocks.enqueueJob).toHaveBeenCalledWith({
      type: "submitMatchReport",
      payload: {
        payload: expect.objectContaining({
          goalkeeper: "James Beadle",
          team: "Birmingham City",
          opponent: "Blackburn Rovers",
          comments: VALID_COMMENTS,
        }),
        submissionKey: "submission-key-1",
      },
      userId: USER.id,
      label: "Match report — James Beadle vs Blackburn Rovers",
    });
    expect(mocks.clearDraft).toHaveBeenCalledWith(USER.id);
    expect(mocks.refreshInteractionViews).not.toHaveBeenCalled();
    expect(await screen.findByText(/This report is queued locally/i)).toBeTruthy();
  });
});
