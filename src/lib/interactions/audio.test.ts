import { describe, expect, it, vi } from "vitest";
import {
  interactionAudioFileName,
  interactionAudioNotes,
  interactionAudioTitle,
  persistInteractionAudio,
} from "@/lib/interactions/audio";

describe("persisting an interaction's voice recording", () => {
  it("uploads then links, reporting success only when both steps succeeded", async () => {
    const upload = vi.fn(async () => "media-1");
    const link = vi.fn(async () => {});

    const result = await persistInteractionAudio({ upload, link });

    expect(result).toEqual({ ok: true, mediaId: "media-1" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledWith("media-1");
  });

  it("reports failure without a media id when the upload fails", async () => {
    const upload = vi.fn(async () => {
      throw new Error("Upload failed: network");
    });
    const link = vi.fn(async () => {});

    const result = await persistInteractionAudio({ upload, link });

    expect(result.ok).toBe(false);
    // Nothing reached storage, so there is nothing to reuse or clean up.
    expect(result.ok === false && result.mediaId).toBeNull();
    expect(result.ok === false && result.message).toContain("network");
    expect(link).not.toHaveBeenCalled();
  });

  it("never reports success when the upload returns no media id", async () => {
    const result = await persistInteractionAudio({
      upload: async () => "",
      link: vi.fn(async () => {}),
    });
    expect(result.ok).toBe(false);
  });

  it("hands back the uploaded media id when only the link failed, so it can be retried", async () => {
    const result = await persistInteractionAudio({
      upload: async () => "media-1",
      link: async () => {
        throw new Error("permission denied");
      },
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.mediaId).toBe("media-1");
  });

  it("retrying a failed link re-uses the uploaded recording instead of uploading a second copy", async () => {
    const upload = vi.fn(async () => "media-1");
    const failingLink = vi.fn(async () => {
      throw new Error("permission denied");
    });

    const first = await persistInteractionAudio({ upload, link: failingLink });
    expect(first.ok).toBe(false);
    expect(upload).toHaveBeenCalledTimes(1);

    const link = vi.fn(async () => {});
    const retry = await persistInteractionAudio({
      upload,
      link,
      uploadedMediaId: first.ok === false ? first.mediaId : null,
    });

    expect(retry).toEqual({ ok: true, mediaId: "media-1" });
    // The single upload from the first attempt is the only one — no duplicate.
    expect(upload).toHaveBeenCalledTimes(1);
    expect(link).toHaveBeenCalledWith("media-1");
  });

  it("never throws, so a recording problem cannot surface as a failed interaction", async () => {
    await expect(
      persistInteractionAudio({
        upload: async () => {
          throw new Error("boom");
        },
        link: async () => {},
      }),
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("recording metadata", () => {
  it("derives an extension from the recorded mime type", () => {
    const at = new Date("2026-08-05T12:00:00.000Z");
    expect(interactionAudioFileName("audio/webm;codecs=opus", at)).toMatch(/\.webm$/);
    expect(interactionAudioFileName("audio/mp4", at)).toMatch(/\.mp4$/);
    expect(interactionAudioFileName("audio/mpeg", at)).toMatch(/\.mp3$/);
    // Unknown types still produce a usable name rather than failing the upload.
    expect(interactionAudioFileName("audio/exotic", at)).toMatch(/\.webm$/);
  });

  it("labels the asset with the goalkeeper and the interaction date", () => {
    expect(interactionAudioTitle("Tom Watson", "2026-08-05")).toBe(
      "Voice note — Tom Watson · 2026-08-05",
    );
    expect(interactionAudioNotes(12.4)).toContain("12s");
  });
});
