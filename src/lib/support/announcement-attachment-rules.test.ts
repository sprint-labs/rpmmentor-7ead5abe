import { describe, expect, it } from "vitest";
import {
  MAX_ANNOUNCEMENT_ATTACHMENT_BYTES,
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
      validateAnnouncementAttachment({ name: "release.exe", type: "application/x-msdownload", size: 1 }),
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
});
