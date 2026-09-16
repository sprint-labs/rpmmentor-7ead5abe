import { describe, expect, it, vi } from "vitest";
import { ANNOUNCEMENT_ATTACHMENT_MAX_BYTES, type AnnouncementAttachment } from "./schema";
import { verifyStoredAnnouncementAttachment } from "./announcement-storage-verification";

const ATTACHMENT: AnnouncementAttachment = {
  path: "announcements/2026/123e4567-e89b-12d3-a456-426614174000-example.pdf",
  name: "example.pdf",
  mime: "application/pdf",
  size: 1024,
};

describe("stored Broadcast attachment verification", () => {
  it("accepts matching Storage system metadata", async () => {
    const readInfo = vi.fn().mockResolvedValue({
      data: { size: 1024, contentType: "application/pdf" },
      error: null,
    });

    await expect(verifyStoredAnnouncementAttachment(ATTACHMENT, readInfo)).resolves.toBeUndefined();
    expect(readInfo).toHaveBeenCalledWith(ATTACHMENT.path);
  });

  it("accepts the metadata shape returned by older Storage info endpoints", async () => {
    await expect(
      verifyStoredAnnouncementAttachment(ATTACHMENT, async () => ({
        data: { metadata: { size: 1024, mimetype: "application/pdf" } },
        error: null,
      })),
    ).resolves.toBeUndefined();
  });

  it("accepts the exact byte cap and normalises Storage content type", async () => {
    await expect(
      verifyStoredAnnouncementAttachment(
        { ...ATTACHMENT, size: ANNOUNCEMENT_ATTACHMENT_MAX_BYTES },
        async () => ({
          data: {
            size: ANNOUNCEMENT_ATTACHMENT_MAX_BYTES,
            contentType: "Application/PDF; charset=binary",
          },
          error: null,
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects an actual object above the byte cap despite a forged small claim", async () => {
    const readInfo = vi.fn().mockResolvedValue({
      data: { size: ANNOUNCEMENT_ATTACHMENT_MAX_BYTES + 1, contentType: "application/pdf" },
      error: null,
    });

    await expect(verifyStoredAnnouncementAttachment(ATTACHMENT, readInfo)).rejects.toThrow(
      "exceeds the 25 MB limit",
    );
  });

  it("rejects claimed size and MIME mismatches", async () => {
    await expect(
      verifyStoredAnnouncementAttachment(ATTACHMENT, async () => ({
        data: { size: 2048, contentType: "application/pdf" },
        error: null,
      })),
    ).rejects.toThrow("size does not match");

    await expect(
      verifyStoredAnnouncementAttachment(ATTACHMENT, async () => ({
        data: { size: 1024, contentType: "text/html; charset=utf-8" },
        error: null,
      })),
    ).rejects.toThrow("type does not match");
  });

  it("fails closed when Storage cannot return object metadata", async () => {
    await expect(
      verifyStoredAnnouncementAttachment(ATTACHMENT, async () => ({
        data: null,
        error: { message: "Object not found" },
      })),
    ).rejects.toThrow("Object not found");

    await expect(
      verifyStoredAnnouncementAttachment(ATTACHMENT, async () => ({
        data: { contentType: "application/pdf" },
        error: null,
      })),
    ).rejects.toThrow("Could not verify the uploaded attachment size");
  });
});
