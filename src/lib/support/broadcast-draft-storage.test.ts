import { describe, expect, it, vi } from "vitest";
import {
  readBroadcastDraft,
  removeBroadcastDraft,
  restoreBroadcastScheduleTime,
  writeBroadcastDraft,
  type BroadcastDraft,
  type BroadcastDraftStorage,
} from "./broadcast-draft-storage";

const draft: BroadcastDraft = {
  kind: "info",
  title: "Training update",
  body: "The draft remains usable without persistence.",
  publishMode: "later",
  startsAt: "2026-09-02T09:00",
  scheduleTimeSource: "user",
  expiryMode: "24h",
  endsAt: "",
};

function storage(overrides: Partial<BroadcastDraftStorage> = {}): BroadcastDraftStorage {
  return {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    ...overrides,
  };
}

describe("Broadcast draft storage", () => {
  it("reads a valid saved draft", () => {
    const target = storage({ getItem: vi.fn(() => JSON.stringify(draft)) });

    expect(readBroadcastDraft(target)).toEqual(draft);
  });

  it("refreshes a hidden auto schedule when restoring a publish-now draft", () => {
    expect(
      restoreBroadcastScheduleTime({
        publishMode: "now",
        startsAt: "2026-09-01T09:00",
      }),
    ).toEqual({ startsAt: "", source: "auto" });
    expect(
      restoreBroadcastScheduleTime({
        publishMode: "later",
        startsAt: "2026-09-01T09:00",
        scheduleTimeSource: "auto",
      }),
    ).toEqual({ startsAt: "", source: "auto" });
  });

  it("preserves legacy scheduled drafts and explicit user clearing", () => {
    expect(
      restoreBroadcastScheduleTime({
        publishMode: "later",
        startsAt: "2026-09-02T09:00",
      }),
    ).toEqual({ startsAt: "2026-09-02T09:00", source: "draft" });
    expect(
      restoreBroadcastScheduleTime({
        publishMode: "later",
        startsAt: "",
        scheduleTimeSource: "user",
      }),
    ).toEqual({ startsAt: "", source: "user" });
  });

  it("recovers when reading and cleanup are both blocked", () => {
    const target = storage({
      getItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
      removeItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
    });

    expect(() => readBroadcastDraft(target)).not.toThrow();
    expect(readBroadcastDraft(target)).toBeNull();
  });

  it("treats malformed JSON as no draft even when removal fails", () => {
    const target = storage({
      getItem: vi.fn(() => "{not-json"),
      removeItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
    });

    expect(readBroadcastDraft(target)).toBeNull();
  });

  it("ignores quota errors while saving", () => {
    const target = storage({
      setItem: vi.fn(() => {
        throw new DOMException("Storage full", "QuotaExceededError");
      }),
    });

    expect(() => writeBroadcastDraft(draft, target)).not.toThrow();
  });

  it("ignores blocked storage while clearing", () => {
    const target = storage({
      removeItem: vi.fn(() => {
        throw new DOMException("Blocked", "SecurityError");
      }),
    });

    expect(() => removeBroadcastDraft(target)).not.toThrow();
  });
});
