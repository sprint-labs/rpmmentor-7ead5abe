import { describe, expect, it, vi } from "vitest";
import {
  ANNOUNCEMENT_MEDIA_STORAGE_READINESS_RPC,
  requireAnnouncementMediaStorageReady,
} from "./announcement-media-capability";

describe("Broadcast media storage capability", () => {
  it("accepts only a literal true response without an error", async () => {
    const invoke = vi.fn(async () => ({ data: true, error: null }));

    await expect(requireAnnouncementMediaStorageReady(invoke)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith(ANNOUNCEMENT_MEDIA_STORAGE_READINESS_RPC);
  });

  it.each([
    { data: false, error: null },
    { data: null, error: null },
    { data: true, error: { message: "RPC unavailable" } },
  ])("fails closed for $data with error $error", async (response) => {
    await expect(requireAnnouncementMediaStorageReady(async () => response)).rejects.toThrow(
      "Media attachments are unavailable",
    );
  });

  it("fails closed when the readiness request throws", async () => {
    await expect(
      requireAnnouncementMediaStorageReady(async () => {
        throw new Error("network unavailable");
      }),
    ).rejects.toThrow("Media attachments are unavailable");
  });
});
