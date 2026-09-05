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

  it("samples an authenticated server clock before the first-broadcast upload", () => {
    const source = readFileSync(
      new URL("../../components/broadcast-centre.tsx", import.meta.url),
      "utf8",
    );
    const mutationStart = source.indexOf("mutationFn: async () => {");
    const mutationEnd = source.indexOf("onSuccess:", mutationStart);
    const mutationSource = source.slice(mutationStart, mutationEnd);
    const requestStart = mutationSource.indexOf("const clockRequestStartedAt");
    const clockRead = mutationSource.indexOf("await getAdminClock()");
    const preflight = mutationSource.indexOf("resolveBroadcastWindow(draftWindow");
    const upload = mutationSource.indexOf("uploadAnnouncementAttachment(attachmentFile)");

    expect(requestStart).toBeGreaterThanOrEqual(0);
    expect(clockRead).toBeGreaterThan(requestStart);
    expect(clockRead).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeGreaterThan(clockRead);
    expect(upload).toBeGreaterThan(preflight);
    expect(mutationSource).toContain("performance.now() - clockRequestStartedAt");
    expect(mutationSource).toContain("Date.now() - clockRequestWallStartedAt");
    expect(mutationSource).toMatch(/nowMs:\s*currentAdminServerNow\(\)/);
  });

  it("bases the schedule picker and its default on a sampled server clock", () => {
    const source = readFileSync(
      new URL("../../components/broadcast-centre.tsx", import.meta.url),
      "utf8",
    );
    const composerLock = source.indexOf("const composerLocked");
    const autoScheduleEffect = source.indexOf("useEffect(() => {", composerLock);
    const duplicateStart = source.indexOf("function duplicateAnnouncement", autoScheduleEffect);
    const autoScheduleSource = source.slice(autoScheduleEffect, duplicateStart);

    expect(source).toContain('queryKey: ["announcements", "admin", "clock"]');
    expect(source).toContain("draftReady && adminClockSample");
    expect(source).toContain('scheduleTimeSourceRef.current !== "auto"');
    expect(composerLock).toBeGreaterThanOrEqual(0);
    expect(autoScheduleEffect).toBeGreaterThan(composerLock);
    expect(duplicateStart).toBeGreaterThan(autoScheduleEffect);
    expect(autoScheduleSource).toContain("composerLocked ||");
    expect(autoScheduleSource).toContain("}, [adminServerNow, composerLocked]);");
    expect(source).toContain('scheduleTimeSourceRef.current = "user"');
    expect(source).toContain("restoreBroadcastScheduleTime(draft)");
    expect(source).toContain("scheduleTimeSource:");
    expect(source).toContain("setStartsAt((current) => (current === next ? current : next))");
    expect(source).toContain("nextAdminScheduleInputMinAt(");
    expect(source).toContain("BROADCAST_SCHEDULE_MIN_LEAD_MS");
    expect(source).toContain("Date.now() - adminClockSample.wallStartedAt");
    expect(source).toContain("disabled={composerLocked || adminServerNow === null}");
    expect(source).toContain('(publishMode === "later" && adminServerNow === null)');
    expect(source).toContain("onClick={() => void refetchAdminClock()}");
    expect(source).not.toContain("nextAdminScheduleAt(Date.now())");
  });

  it("protects the publication clock endpoint with the Super Admin role", () => {
    const source = readFileSync(new URL("../support.functions.ts", import.meta.url), "utf8");
    const clockStart = source.indexOf("export const getAdminAnnouncementClock");
    const clockEnd = source.indexOf("export const markAnnouncementRead", clockStart);
    const clockSource = source.slice(clockStart, clockEnd);

    expect(clockStart).toBeGreaterThanOrEqual(0);
    expect(clockEnd).toBeGreaterThan(clockStart);
    expect(clockSource).toContain('createServerFn({ method: "POST" })');
    expect(clockSource).toContain("requireSupabaseAuth");
    expect(clockSource).toContain("SUPPORT_INBOX_ROLES");
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
