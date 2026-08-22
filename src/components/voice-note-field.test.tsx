// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => vi.fn(),
}));

vi.mock("@/lib/api/transcribe.functions", () => ({
  transcribeVoiceNote: {},
}));

vi.mock("@/lib/api/summarize.functions", () => ({
  rewriteTranscript: {},
  summarizeTranscript: {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

const { VoiceNoteField } = await import("./voice-note-field");

describe("VoiceNoteField autoApply", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("does not offer append/replace controls when autoApply already pushed text to Notes", () => {
    render(
      <VoiceNoteField
        autoApply
        onTranscribed={vi.fn()}
        draft={{
          transcript: "Spoken note about the session.",
          tokens: [],
          avgConfidence: 0.95,
          reviewed: false,
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: /append to comments/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /replace comments/i })).toBeNull();
    expect(screen.getByText(/already in Notes/i)).toBeTruthy();
  });

  it("still offers append/replace controls when autoApply is off", () => {
    render(
      <VoiceNoteField
        onTranscribed={vi.fn()}
        draft={{
          transcript: "Spoken note about the session.",
          tokens: [],
          avgConfidence: 0.95,
          reviewed: true,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: /append to comments/i })).toBeTruthy();
  });
});
