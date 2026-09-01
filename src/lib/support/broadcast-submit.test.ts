import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AnnouncementAttachment } from "./schema";
import { submitBroadcastAfterUpload } from "./broadcast-submit";

const NOW = Date.parse("2026-09-01T12:00:00.000Z");
const ATTACHMENT: AnnouncementAttachment = {
  path: "announcements/2026/123e4567-e89b-12d3-a456-426614174000-example.pdf",
  name: "example.pdf",
  mime: "application/pdf",
  size: 1024,
};

const STALE_DRAFT = {
  publishMode: "later" as const,
  startsAt: "2026-09-01T12:00:20.000Z",
  expiryMode: "none" as const,
  endsAt: "",
};

describe("post-upload broadcast submission", () => {
  it("locks native and custom composer controls for the whole submission", () => {
    const source = readFileSync(
      new URL("../../components/broadcast-centre.tsx", import.meta.url),
      "utf8",
    );

    expect(source.match(/disabled=\{composerLocked\}/g)?.length).toBeGreaterThanOrEqual(10);
    expect(source).toContain("aria-disabled={composerLocked}");
    expect(source).toContain("if (composerLocked) return;");
  });

  it("removes an unlinked upload and never submits a stale delivery window", async () => {
    const removeAttachment = vi.fn().mockResolvedValue(undefined);
    const submit = vi.fn();

    await expect(
      submitBroadcastAfterUpload({
        draft: STALE_DRAFT,
        attachment: ATTACHMENT,
        removeAttachment,
        submit,
        nowMs: NOW,
      }),
    ).rejects.toThrow("Scheduled broadcasts need a future publish time.");

    expect(removeAttachment).toHaveBeenCalledWith(ATTACHMENT);
    expect(submit).not.toHaveBeenCalled();
  });

  it("preserves the timing error when cleanup also fails", async () => {
    const removeAttachment = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    const submit = vi.fn();

    await expect(
      submitBroadcastAfterUpload({
        draft: STALE_DRAFT,
        attachment: ATTACHMENT,
        removeAttachment,
        submit,
        nowMs: NOW,
      }),
    ).rejects.toThrow("Scheduled broadcasts need a future publish time.");

    expect(submit).not.toHaveBeenCalled();
  });

  it("never removes media after submit begins, even when the result is ambiguous", async () => {
    const removeAttachment = vi.fn();
    const submitError = new Error("connection reset after insert");
    const submit = vi.fn().mockRejectedValue(submitError);

    await expect(
      submitBroadcastAfterUpload({
        draft: {
          publishMode: "later",
          startsAt: "2026-09-01T12:01:00.000Z",
          expiryMode: "none",
          endsAt: "",
        },
        attachment: ATTACHMENT,
        removeAttachment,
        submit,
        nowMs: NOW,
      }),
    ).rejects.toBe(submitError);

    expect(submit).toHaveBeenCalledOnce();
    expect(removeAttachment).not.toHaveBeenCalled();
  });
});
