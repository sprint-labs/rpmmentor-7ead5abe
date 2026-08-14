// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const transcribeMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => transcribeMock,
}));

vi.mock("@/lib/api/transcribe.functions", () => ({
  transcribeNotes: {},
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { HandwrittenNotesField } from "./handwritten-notes-field";

afterEach(() => {
  cleanup();
  transcribeMock.mockReset();
});

function uploadNotesImage() {
  const file = new File(["fake-image-bytes"], "notes.jpg", { type: "image/jpeg" });
  const input = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("HandwrittenNotesField", () => {
  it("shows the transcription error inline with a Retry button when OCR fails", async () => {
    transcribeMock.mockResolvedValue({ ok: false, error: "AI service is not configured." });

    render(<HandwrittenNotesField onTranscribed={vi.fn()} />);
    uploadNotesImage();

    expect((await screen.findByRole("alert")).textContent).toContain("AI service is not configured.");
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    expect(screen.getByAltText("Handwritten notes preview")).toBeTruthy();
    expect(screen.queryByText("Transcript")).toBeNull();
  });

  it("retries transcription from the failed state and shows the transcript on success", async () => {
    transcribeMock
      .mockResolvedValueOnce({ ok: false, error: "AI service is not configured." })
      .mockResolvedValueOnce({ ok: true, text: "Kept a clean sheet." });

    render(<HandwrittenNotesField onTranscribed={vi.fn()} />);
    uploadNotesImage();

    const retry = await screen.findByRole("button", { name: /retry/i });
    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByText("Kept a clean sheet.")).toBeTruthy();
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(transcribeMock).toHaveBeenCalledTimes(2);
  });
});
