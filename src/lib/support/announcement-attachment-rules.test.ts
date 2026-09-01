import { describe, expect, it } from "vitest";
import {
  MAX_ANNOUNCEMENT_ATTACHMENTS,
  MAX_ANNOUNCEMENT_ATTACHMENT_BYTES,
  attachmentFromAnnouncementColumns,
  buildAnnouncementObjectName,
  originalAnnouncementFileName,
  sanitiseAnnouncementFileName,
  validateAnnouncementAttachment,
} from "@/lib/support/announcement-attachment-rules";

describe("announcement attachment rules", () => {
  it("accepts supported files within the limit", () => {
    expect(
      validateAnnouncementAttachment({
        name: "release.png",
        type: "image/png",
        size: 1024,
      }),
    ).toBeNull();
  });

  it("rejects unsupported or oversized files", () => {
    expect(
      validateAnnouncementAttachment({
        name: "release.exe",
        type: "application/x-msdownload",
        size: 1,
      }),
    ).toContain("not a supported");
    expect(
      validateAnnouncementAttachment({
        name: "long-video.mp4",
        type: "video/mp4",
        size: MAX_ANNOUNCEMENT_ATTACHMENT_BYTES + 1,
      }),
    ).toContain("larger than");
  });

  it("creates safe object names while retaining a readable original name", () => {
    expect(sanitiseAnnouncementFileName("Match update (final).pdf")).toBe(
      "Match-update-final-.pdf",
    );
    const objectName = buildAnnouncementObjectName("Match update (final).pdf", "abc123");
    expect(objectName).toBe("abc123__Match-update-final-.pdf");
    expect(originalAnnouncementFileName(objectName)).toBe("Match-update-final-.pdf");
  });

  it("allows only one attachment and reads it from announcement columns, not storage listings", () => {
    expect(MAX_ANNOUNCEMENT_ATTACHMENTS).toBe(1);
    expect(
      attachmentFromAnnouncementColumns({
        attachment_path: "announcements/2026/abc__release.png",
        attachment_name: "release.png",
        attachment_mime: "image/png",
        attachment_size: 1024,
      }),
    ).toEqual({
      path: "announcements/2026/abc__release.png",
      fileName: "release.png",
      mimeType: "image/png",
      fileSize: 1024,
    });
    expect(
      attachmentFromAnnouncementColumns({
        attachment_path: null,
        attachment_name: "extra.png",
        attachment_mime: "image/png",
        attachment_size: 12,
      }),
    ).toBeNull();
  });
});
