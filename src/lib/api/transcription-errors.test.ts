import { describe, expect, it } from "vitest";

import { transcriptionFailureMessage } from "./transcription-errors";

describe("transcriptionFailureMessage", () => {
  it("shows the reason the server gave instead of replacing it with a generic sentence", () => {
    const message = transcriptionFailureMessage(
      "AI service is not configured — OPENAI_API_KEY is not set for this environment.",
    );

    expect(message).toContain("OPENAI_API_KEY is not set for this environment");
    expect(message).toContain("Your recording is still available");
    expect(message).not.toContain("We could not process this audio recording");
  });

  it("keeps distinct causes distinguishable on screen", () => {
    const quota = transcriptionFailureMessage(
      "OpenAI rate limit or quota reached — check billing.",
    );
    const format = transcriptionFailureMessage("Unsupported audio type (audio/aac).");

    expect(quota).not.toEqual(format);
  });

  it("falls back to the generic message when no reason is available", () => {
    for (const reason of [undefined, null, "", "   "]) {
      expect(transcriptionFailureMessage(reason)).toContain(
        "We could not process this audio recording",
      );
    }
  });
});
