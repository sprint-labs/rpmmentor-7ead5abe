// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createInteractionMock = vi.fn();
const updateInteractionMock = vi.fn();
const attachInteractionAudioMock = vi.fn();
const uploadMediaMock = vi.fn();
const listPlayersMock = vi.fn(async () => [
  { id: "p1", full_name: "Demo Keeper", current_club: "Roster FC" },
]);

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["middleware"] = () => chain;
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
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/interactions.functions", () => ({
  createInteraction: (...args: unknown[]) => createInteractionMock(...args),
  updateInteraction: (...args: unknown[]) => updateInteractionMock(...args),
  attachInteractionAudio: (...args: unknown[]) => attachInteractionAudioMock(...args),
  listInteractions: vi.fn(async () => []),
  listInteractionAudio: vi.fn(async () => []),
}));
vi.mock("@/lib/media-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media-store")>()),
  uploadMedia: (...args: unknown[]) => uploadMediaMock(...args),
}));
vi.mock("@/lib/players.functions", () => ({
  listPlayers: () => listPlayersMock(),
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Mentor" }, can: () => true }),
}));
vi.mock("@/components/handwritten-notes-field", () => ({
  HandwrittenNotesField: () => null,
}));
/**
 * Stands in for the real field, exposing the two contracts the interaction form
 * depends on:
 *
 *   - `autoApply`, asserted so the form cannot silently regress to the
 *     review-gated behaviour that caused spoken notes to be lost;
 *   - `onRecordingReady`, which hands the raw recording to the form so it can
 *     be uploaded and linked after the interaction is confirmed saved.
 */
vi.mock("@/components/voice-note-field", () => ({
  VoiceNoteField: ({
    onTranscribed,
    onRecordingReady,
    autoApply,
  }: {
    onTranscribed: (t: string, m: "append" | "replace") => void;
    onRecordingReady?: (r: { blob: Blob; mimeType: string; durationSec: number } | null) => void;
    autoApply?: boolean;
  }) => (
    <>
      <button
        type="button"
        data-auto-apply={autoApply ? "true" : "false"}
        onClick={() => onTranscribed("Spoken note about the session.", "append")}
      >
        simulate transcription
      </button>
      <button
        type="button"
        data-has-recording-hook={onRecordingReady ? "true" : "false"}
        onClick={() =>
          onRecordingReady?.({
            blob: new Blob(["audio-bytes"], { type: "audio/webm" }),
            mimeType: "audio/webm",
            durationSec: 12,
          })
        }
      >
        simulate recording
      </button>
      <button type="button" onClick={() => onRecordingReady?.(null)}>
        simulate discard recording
      </button>
    </>
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { InteractionForm } = await import("./workflows");
const { goalkeepers } = await import("@/lib/mock-data");
type LoggedInteraction = import("@/lib/interactions/schema").LoggedInteraction;

function renderForm(props: Partial<React.ComponentProps<typeof InteractionForm>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InteractionForm onDone={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

const EXISTING: LoggedInteraction = {
  id: "11111111-1111-4111-8111-111111111111",
  gkSlug: "",
  goalkeeperName: "Tom Watson",
  playerId: null,
  mentorId: "u1",
  mentorName: "Mentor",
  interactionType: "Phone Call",
  club: "Rotherham United",
  occurredAt: "2026-07-01",
  notes: "Original note.",
  outcome: "On track",
  followUp: "Check in next week",
  createdAt: "2026-07-01T10:00:00.000Z",
  matchReportId: null,
  updatedAt: null,
  updatedBy: null,
};

async function fillValidForm() {
  const gk = goalkeepers[0]!;
  fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });
  fireEvent.change(screen.getByLabelText("Interaction Type"), {
    target: { value: "Coffee Catch Up" },
  });
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-05" } });
  fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "On track" } });
  fireEvent.change(screen.getByLabelText("Follow-up Action"), {
    target: { value: "Schedule video review next week" },
  });
  fireEvent.change(screen.getByLabelText("Notes"), {
    target: { value: "Reviewed the recovery plan." },
  });
  return gk;
}

describe("InteractionForm (durable)", () => {
  beforeEach(() => {
    createInteractionMock.mockReset();
    updateInteractionMock.mockReset();
    attachInteractionAudioMock.mockReset();
    uploadMediaMock.mockReset();
    listPlayersMock.mockClear();
  });

  afterEach(() => cleanup());

  it("renders a real entry form with every collected value", () => {
    renderForm();
    for (const label of [
      "Goalkeeper",
      "Interaction Type",
      "Club",
      "Date",
      "Outcome",
      "Notes",
      "Follow-up Action",
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /save interaction/i })).toBeTruthy();
  });

  /**
   * The submit button used to be `disabled` whenever the form was incomplete.
   * That is how a voice-entered note failed silently: the transcript never
   * reached Notes, so pressing a greyed-out button did nothing and said nothing.
   * It now stays pressable and explains what is missing instead.
   */
  it("stays pressable while incomplete and reports what is missing instead of failing silently", async () => {
    renderForm();
    const submitBtn = screen.getByRole("button", {
      name: /save interaction/i,
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    expect(submitBtn.getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(submitBtn);
    // Nothing is written, and the reason is shown rather than swallowed.
    expect(createInteractionMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/select a goalkeeper/i)).toBeTruthy());
    expect(screen.getByText(/complete the highlighted fields to save/i)).toBeTruthy();

    await fillValidForm();
    await waitFor(() => expect(submitBtn.getAttribute("aria-disabled")).toBe("false"));
  });

  // ---- Change #4: a spoken note must reach the database ---------------------

  it("puts a voice transcript straight into Notes so it is visible and editable", () => {
    renderForm();
    expect(
      screen
        .getByRole("button", { name: /simulate transcription/i })
        .getAttribute("data-auto-apply"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /simulate transcription/i }));

    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toContain(
      "Spoken note about the session.",
    );
  });

  it("saves a voice-entered note — the case that was silently losing data", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1", occurredAt: "2026-01-05" });
    renderForm();
    const gk = goalkeepers[0]!;
    fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });
    fireEvent.change(screen.getByLabelText("Interaction Type"), {
      target: { value: "Coffee Catch Up" },
    });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-05" } });
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "On track" } });
    fireEvent.change(screen.getByLabelText("Follow-up Action"), {
      target: { value: "Schedule video review next week" },
    });
    // Notes come only from the voice note — nothing is typed.
    fireEvent.click(screen.getByRole("button", { name: /simulate transcription/i }));
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(createInteractionMock).toHaveBeenCalledTimes(1));
    const payload = createInteractionMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data["notes"]).toBe("Spoken note about the session.");
  });

  it("keeps a transcript that arrives while the form is otherwise complete", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1", occurredAt: "2026-01-05" });
    renderForm();
    await fillValidForm();
    // Appended after the rest of the form was filled in.
    fireEvent.click(screen.getByRole("button", { name: /simulate transcription/i }));
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(createInteractionMock).toHaveBeenCalledTimes(1));
    const payload = createInteractionMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data["notes"]).toContain("Reviewed the recovery plan.");
    expect(payload.data["notes"]).toContain("Spoken note about the session.");
  });

  // ---- Change #1: Live Match Observation hands over to the Match Report ----

  it("does not log a Live Match Observation directly — it hands over to the Match Report", async () => {
    const onOpenMatchReport = vi.fn();
    renderForm({ onOpenMatchReport });
    const gk = goalkeepers[0]!;
    fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });
    fireEvent.change(screen.getByLabelText("Interaction Type"), {
      target: { value: "Live Match Observation" },
    });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-07-09" } });
    fireEvent.change(screen.getByLabelText("Club"), { target: { value: "Rotherham United" } });

    // No save path is offered, and the reason is explained on screen.
    expect(screen.queryByRole("button", { name: /save interaction/i })).toBeNull();
    expect(screen.getByText(/logged from the match report/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /continue to match report/i }));

    expect(createInteractionMock).not.toHaveBeenCalled();
    expect(onOpenMatchReport).toHaveBeenCalledWith({
      goalkeeper: gk.name,
      matchDate: "2026-07-09",
      club: "Rotherham United",
    });
  });

  it("defaults to a type that can actually be logged by hand", () => {
    renderForm();
    expect((screen.getByLabelText("Interaction Type") as HTMLSelectElement).value).not.toBe(
      "Live Match Observation",
    );
  });

  // ---- Change #3: editing an existing interaction --------------------------

  it("prefills every field when correcting an existing interaction", () => {
    renderForm({ editing: EXISTING });
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-07-01");
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Original note.");
    expect((screen.getByLabelText("Club") as HTMLInputElement).value).toBe("Rotherham United");
    expect((screen.getByLabelText("Interaction Type") as HTMLSelectElement).value).toBe(
      "Phone Call",
    );
    expect(screen.getByRole("button", { name: /save changes/i })).toBeTruthy();
  });

  it("updates the original record instead of creating a replacement", async () => {
    updateInteractionMock.mockResolvedValue({
      ...EXISTING,
      occurredAt: "2026-07-09",
      notes: "Corrected note.",
    });
    renderForm({ editing: EXISTING });

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-07-09" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Corrected note." } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(updateInteractionMock).toHaveBeenCalledTimes(1));
    // No new row is ever written when correcting.
    expect(createInteractionMock).not.toHaveBeenCalled();
    const payload = updateInteractionMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data["id"]).toBe(EXISTING.id);
    expect(payload.data["occurredAt"]).toBe("2026-07-09");
    await waitFor(() => expect(screen.getByText(/interaction updated/i)).toBeTruthy());
  });

  it("never claims an edit succeeded when the server does not confirm the new value", async () => {
    // Server echoes the OLD date — the correction did not persist.
    updateInteractionMock.mockResolvedValue({ ...EXISTING });
    renderForm({ editing: EXISTING });

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-07-09" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/interaction updated/i)).toBeNull();
    // The entered correction is kept so nothing is lost.
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-07-09");
  });

  it("shows success only after a confirmed inserted row is returned", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1", occurredAt: "2026-01-05" });
    renderForm();
    const gk = await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(createInteractionMock).toHaveBeenCalledTimes(1));
    const payload = createInteractionMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(payload.data["goalkeeperName"]).toBe(gk.name);
    expect(payload.data["occurredAt"]).toBe("2026-01-05");
    expect(payload.data["interactionType"]).toBe("Coffee Catch Up");
    // Mentor identity is never sent from the client.
    expect(payload.data["mentorId"]).toBeUndefined();

    await waitFor(() => expect(screen.getByText(/logged successfully/i)).toBeTruthy());
  });

  it("never claims success when the server returns no confirmed row", async () => {
    createInteractionMock.mockResolvedValue({});
    renderForm();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText(/logged successfully/i)).toBeNull();
  });

  it("retains entered values and surfaces the error when saving fails", async () => {
    createInteractionMock.mockRejectedValue(new Error("Unauthorized"));
    renderForm();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Unauthorized"));
    expect(screen.queryByText(/logged successfully/i)).toBeNull();
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Reviewed the recovery plan.",
    );
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-01-05");
  });

  it("auto-fills the club from the roster but keeps it editable and resettable", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1" });
    const gk = goalkeepers[0]!;
    listPlayersMock.mockResolvedValue([
      { id: "p1", full_name: gk.name, current_club: "Roster FC" },
    ]);
    renderForm();
    fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });

    const club = () => screen.getByLabelText("Club") as HTMLInputElement;
    await waitFor(() => expect(club().value).toBe("Roster FC"));
    fireEvent.change(club(), { target: { value: "Override FC" } });
    expect(club().value).toBe("Override FC");
    fireEvent.click(screen.getByRole("button", { name: /reset to roster club/i }));
    expect(club().value).toBe("Roster FC");
  });

  it("shows inline validation errors for required fields without calling the server", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1" });
    renderForm();
    fireEvent.submit(screen.getByRole("form", { name: /log interaction/i }));

    await waitFor(() => expect(screen.getByText(/Select a goalkeeper/i)).toBeTruthy());
    expect(screen.getByText(/Select an outcome/i)).toBeTruthy();
    expect(screen.getByText(/Follow-up action is required/i)).toBeTruthy();
    expect(screen.getByText(/Notes are required/i)).toBeTruthy();
    expect(createInteractionMock).not.toHaveBeenCalled();
  });

  it("clears inline validation errors as the user fixes each field", async () => {
    createInteractionMock.mockResolvedValue({ id: "i1" });
    renderForm();
    fireEvent.submit(screen.getByRole("form", { name: /log interaction/i }));
    await waitFor(() => expect(screen.getByText(/Select a goalkeeper/i)).toBeTruthy());

    const gk = goalkeepers[0]!;
    fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-05" } });
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "On track" } });
    fireEvent.change(screen.getByLabelText("Follow-up Action"), {
      target: { value: "Schedule video review next week" },
    });
    fireEvent.change(screen.getByLabelText("Notes"), {
      target: { value: "Reviewed the recovery plan." },
    });

    await waitFor(() => expect(screen.queryByText(/Select a goalkeeper/i)).toBeNull());
    expect(screen.queryByText(/Date is required/i)).toBeNull();
    expect(screen.queryByText(/Select an outcome/i)).toBeNull();
    expect(screen.queryByText(/Follow-up action is required/i)).toBeNull();
    expect(screen.queryByText(/Notes are required/i)).toBeNull();
  });
  it("disables the form and shows a spinner on the submit button while saving", async () => {
    createInteractionMock.mockImplementation(() => new Promise(() => {}));
    renderForm();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /saving/i })).toBeTruthy());
    const submitBtn = screen.getByRole("button", { name: /saving/i }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.querySelector("svg")).toBeTruthy();

    const fieldset = document.querySelector(
      "form[aria-label='Log interaction form'] fieldset",
    ) as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
    expect((screen.getByRole("button", { name: /cancel/i }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Saving the voice recording itself
//
// The recording is uploaded through the shared media/storage path and linked to
// the interaction by database id, AFTER the interaction row is confirmed. These
// tests pin the two properties that make that trustworthy: "Audio saved" is
// never shown unless both steps succeeded, and a retry can never duplicate the
// interaction or the recording.
// ---------------------------------------------------------------------------

const SAVED_INTERACTION = {
  id: "33333333-3333-4333-8333-333333333333",
  gkSlug: "gk-demo",
  goalkeeperName: "Demo Keeper",
  playerId: null,
  occurredAt: "2026-01-05",
  interactionType: "Coffee Catch Up",
  notes: "Reviewed the recovery plan.",
};

async function fillFormRecordAndSave() {
  await fillValidForm();
  fireEvent.click(screen.getByRole("button", { name: /simulate recording/i }));
  fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));
}

describe("InteractionForm voice recording persistence", () => {
  beforeEach(() => {
    createInteractionMock.mockReset();
    updateInteractionMock.mockReset();
    attachInteractionAudioMock.mockReset();
    uploadMediaMock.mockReset();
    listPlayersMock.mockClear();
  });

  afterEach(() => cleanup());

  it("gives the recorder somewhere to hand the raw recording", () => {
    renderForm();
    expect(
      screen
        .getByRole("button", { name: /simulate recording/i })
        .getAttribute("data-has-recording-hook"),
    ).toBe("true");
  });

  // 1. Interaction and audio both save successfully.
  it("saves the interaction, uploads the recording and links it by database id", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);
    uploadMediaMock.mockResolvedValue({ id: "media-1" });
    attachInteractionAudioMock.mockResolvedValue({
      id: "link-1",
      interactionId: SAVED_INTERACTION.id,
      mediaId: "media-1",
      created: true,
    });

    renderForm();
    await fillFormRecordAndSave();

    await waitFor(() => expect(attachInteractionAudioMock).toHaveBeenCalledTimes(1));
    expect(createInteractionMock).toHaveBeenCalledTimes(1);
    expect(uploadMediaMock).toHaveBeenCalledTimes(1);

    // Uploaded as audio through the shared media path, not a bespoke one.
    const upload = uploadMediaMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(upload["kind"]).toBe("audio");
    expect((upload["file"] as File).type).toBe("audio/webm");

    // Linked with stable identifiers only — no name or filename matching.
    expect(attachInteractionAudioMock).toHaveBeenCalledWith({
      data: { interactionId: SAVED_INTERACTION.id, mediaId: "media-1" },
    });

    await waitFor(() => expect(screen.getByText(/^audio saved$/i)).toBeTruthy());
    expect(screen.getByText(/logged successfully/i)).toBeTruthy();
  });

  // 2. Interaction succeeds but audio upload fails.
  it("reports the interaction as saved and the audio as not saved when the upload fails", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);
    uploadMediaMock.mockRejectedValue(new Error("Upload failed: storage unavailable"));

    renderForm();
    await fillFormRecordAndSave();

    await waitFor(() =>
      expect(screen.getByText("Interaction saved — audio was not saved")).toBeTruthy(),
    );
    // The interaction is never misreported as unsaved, and audio is never
    // misreported as saved.
    expect(screen.queryByText(/^audio saved$/i)).toBeNull();
    expect(screen.queryByText(/^not saved\.$/i)).toBeNull();
    expect(attachInteractionAudioMock).not.toHaveBeenCalled();
  });

  it("reports a partial failure when the recording uploads but cannot be linked", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);
    uploadMediaMock.mockResolvedValue({ id: "media-1" });
    attachInteractionAudioMock.mockRejectedValue(
      new Error("You do not have permission to attach audio to this interaction."),
    );

    renderForm();
    await fillFormRecordAndSave();

    await waitFor(() =>
      expect(screen.getByText("Interaction saved — audio was not saved")).toBeTruthy(),
    );
    expect(screen.getByRole("alert").textContent).toContain("do not have permission");
    expect(screen.queryByText(/^audio saved$/i)).toBeNull();
  });

  // 3. Failed audio remains retryable.
  it("keeps the recording and offers a retry after a failed upload", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);
    uploadMediaMock.mockRejectedValueOnce(new Error("network"));

    renderForm();
    await fillFormRecordAndSave();
    await waitFor(() =>
      expect(screen.getByText("Interaction saved — audio was not saved")).toBeTruthy(),
    );

    uploadMediaMock.mockResolvedValue({ id: "media-1" });
    attachInteractionAudioMock.mockResolvedValue({ mediaId: "media-1", created: true });

    fireEvent.click(screen.getByRole("button", { name: /retry saving audio/i }));

    await waitFor(() => expect(screen.getByText(/^audio saved$/i)).toBeTruthy());
    expect(screen.queryByText("Interaction saved — audio was not saved")).toBeNull();
  });

  // 4. Retrying does not create duplicates.
  it("retrying a failed link re-uses the upload and never logs a second interaction", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);
    uploadMediaMock.mockResolvedValue({ id: "media-1" });
    attachInteractionAudioMock.mockRejectedValueOnce(new Error("temporary failure"));

    renderForm();
    await fillFormRecordAndSave();
    await waitFor(() =>
      expect(screen.getByText("Interaction saved — audio was not saved")).toBeTruthy(),
    );

    attachInteractionAudioMock.mockResolvedValue({ mediaId: "media-1", created: false });
    fireEvent.click(screen.getByRole("button", { name: /retry saving audio/i }));
    await waitFor(() => expect(screen.getByText(/^audio saved$/i)).toBeTruthy());

    // One interaction, one uploaded recording — the retry only repeated the link.
    expect(createInteractionMock).toHaveBeenCalledTimes(1);
    expect(uploadMediaMock).toHaveBeenCalledTimes(1);
    expect(attachInteractionAudioMock).toHaveBeenCalledTimes(2);
    expect(attachInteractionAudioMock.mock.calls[1]![0]).toEqual({
      data: { interactionId: SAVED_INTERACTION.id, mediaId: "media-1" },
    });
  });

  // 5. Interaction failure does not leave orphaned media.
  it("uploads nothing when the interaction itself fails to save", async () => {
    createInteractionMock.mockRejectedValue(new Error("Unauthorized"));

    renderForm();
    await fillFormRecordAndSave();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Unauthorized"));
    // No media record is created for an interaction that does not exist.
    expect(uploadMediaMock).not.toHaveBeenCalled();
    expect(attachInteractionAudioMock).not.toHaveBeenCalled();
    // Every entered value is kept.
    expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe(
      "Reviewed the recovery plan.",
    );
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe("2026-01-05");
  });

  // 6. Existing transcription-to-Notes behaviour still works.
  it("still writes the transcript into Notes, whether or not the audio upload succeeds", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);
    uploadMediaMock.mockRejectedValue(new Error("storage unavailable"));

    renderForm();
    const gk = goalkeepers[0]!;
    fireEvent.change(screen.getByLabelText("Goalkeeper"), { target: { value: gk.id } });
    fireEvent.change(screen.getByLabelText("Interaction Type"), {
      target: { value: "Coffee Catch Up" },
    });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-01-05" } });
    fireEvent.change(screen.getByLabelText("Outcome"), { target: { value: "On track" } });
    fireEvent.change(screen.getByLabelText("Follow-up Action"), {
      target: { value: "Schedule video review next week" },
    });
    fireEvent.click(screen.getByRole("button", { name: /simulate recording/i }));
    fireEvent.click(screen.getByRole("button", { name: /simulate transcription/i }));
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(createInteractionMock).toHaveBeenCalledTimes(1));
    const payload = createInteractionMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    // The spoken note reached the database even though its audio did not.
    expect(payload.data["notes"]).toBe("Spoken note about the session.");
    await waitFor(() =>
      expect(screen.getByText("Interaction saved — audio was not saved")).toBeTruthy(),
    );
  });

  it("saves the interaction alone when nothing was recorded", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);

    renderForm();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(screen.getByText(/logged successfully/i)).toBeTruthy());
    expect(uploadMediaMock).not.toHaveBeenCalled();
    expect(attachInteractionAudioMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/^audio saved$/i)).toBeNull();
  });

  it("does not try to save a recording the user discarded", async () => {
    createInteractionMock.mockResolvedValue(SAVED_INTERACTION);

    renderForm();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: /simulate recording/i }));
    fireEvent.click(screen.getByRole("button", { name: /simulate discard recording/i }));
    fireEvent.click(screen.getByRole("button", { name: /save interaction/i }));

    await waitFor(() => expect(screen.getByText(/logged successfully/i)).toBeTruthy());
    expect(uploadMediaMock).not.toHaveBeenCalled();
  });
});
