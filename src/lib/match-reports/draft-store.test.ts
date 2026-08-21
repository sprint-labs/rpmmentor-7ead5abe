// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDraft,
  isDraftMeaningful,
  loadDraft,
  overwriteDraft,
  saveDraft,
  subscribeDraftChanges,
  type ReportDraft,
  type ReportDraftSnapshot,
} from "./draft-store";

const START = new Date("2026-08-21T01:00:00.000Z");
const KEY_PREFIX = "rpm.report-draft.v2.";

const DEFAULT_SCORES: ReportDraftSnapshot["scores"] = {
  protect_goal: 3,
  protect_space: 3,
  protect_air: 3,
  control_play: 3,
  change_play: 3,
  psych: 3,
  physical: 3,
};

function snapshot(overrides: Partial<ReportDraftSnapshot> = {}): ReportDraftSnapshot {
  return {
    goalkeeper: "James Beadle",
    coach: "Matt Beadle",
    competition: "Championship",
    team: "Birmingham City",
    opponent: "Blackburn Rovers",
    matchDate: "2026-08-20",
    scores: { ...DEFAULT_SCORES },
    comments: "Strong performance.",
    selectedMedia: [],
    voiceTranscript: null,
    ...overrides,
  };
}

function storedDraft(overrides: Partial<ReportDraft> = {}): ReportDraft {
  return {
    ...snapshot(),
    version: 1,
    tabId: "remote-tab",
    savedAt: START.toISOString(),
    ...overrides,
  };
}

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Match Report draft storage", () => {
  it("saves and loads a versioned draft in the signed-in user's isolated slot", () => {
    const input = snapshot();

    expect(saveDraft("user-a", "tab-a", 0, input)).toEqual({
      ok: true,
      savedAt: START.toISOString(),
      version: 1,
    });
    expect(loadDraft("user-a")).toEqual({
      ...input,
      version: 1,
      tabId: "tab-a",
      savedAt: START.toISOString(),
    });
    expect(loadDraft("user-b")).toBeNull();
  });

  it("allows the same tab to continue saving and increments from the stored version", () => {
    saveDraft("user-a", "tab-a", 0, snapshot({ comments: "First edit" }));
    vi.advanceTimersByTime(1_000);

    expect(saveDraft("user-a", "tab-a", 0, snapshot({ comments: "Second edit" }))).toEqual({
      ok: true,
      savedAt: new Date().toISOString(),
      version: 2,
    });
    expect(loadDraft("user-a")).toMatchObject({
      comments: "Second edit",
      version: 2,
      tabId: "tab-a",
    });
  });

  it("returns the remote draft as a conflict when another tab saved a newer version", () => {
    const remote = snapshot({ comments: "Remote tab edit" });
    saveDraft("user-a", "tab-a", 0, remote);

    const result = saveDraft("user-a", "tab-b", 0, snapshot({ comments: "Local tab edit" }));

    expect(result).toEqual({
      ok: false,
      conflict: {
        ...remote,
        version: 1,
        tabId: "tab-a",
        savedAt: START.toISOString(),
      },
    });
    expect(loadDraft("user-a")).toMatchObject({ comments: "Remote tab edit", tabId: "tab-a" });
  });

  it("force-overwrites a conflicting draft and advances its version", () => {
    saveDraft("user-a", "tab-a", 0, snapshot({ comments: "Remote" }));
    vi.advanceTimersByTime(1_000);

    expect(overwriteDraft("user-a", "tab-b", snapshot({ comments: "Keep mine" }))).toEqual({
      ok: true,
      savedAt: new Date().toISOString(),
      version: 2,
    });
    expect(loadDraft("user-a")).toMatchObject({
      comments: "Keep mine",
      version: 2,
      tabId: "tab-b",
    });
  });

  it("removes drafts older than the 30-day retention period", () => {
    const expired = storedDraft({
      savedAt: new Date(START.getTime() - 31 * 24 * 60 * 60 * 1_000).toISOString(),
    });
    window.localStorage.setItem(storageKey("expired-user"), JSON.stringify(expired));

    expect(loadDraft("expired-user")).toBeNull();
    expect(window.localStorage.getItem(storageKey("expired-user"))).toBeNull();
  });

  it("ignores malformed and incomplete stored values", () => {
    window.localStorage.setItem(storageKey("invalid-json"), "not json");
    window.localStorage.setItem(
      storageKey("missing-version"),
      JSON.stringify({ savedAt: START.toISOString() }),
    );
    window.localStorage.setItem(storageKey("missing-date"), JSON.stringify({ version: 1 }));

    expect(loadDraft("invalid-json")).toBeNull();
    expect(loadDraft("missing-version")).toBeNull();
    expect(loadDraft("missing-date")).toBeNull();
  });

  it("returns a recoverable error when local storage cannot save", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });

    expect(saveDraft("user-a", "tab-a", 0, snapshot())).toEqual({
      ok: false,
      error: "Could not save draft — localStorage may be full or unavailable.",
    });
    expect(overwriteDraft("user-a", "tab-a", snapshot())).toEqual({
      ok: false,
      error: "Could not save draft — localStorage may be full or unavailable.",
    });
  });

  it("clears only the requested user's draft", () => {
    saveDraft("user-a", "tab-a", 0, snapshot({ comments: "A" }));
    saveDraft("user-b", "tab-b", 0, snapshot({ comments: "B" }));

    clearDraft("user-a");

    expect(loadDraft("user-a")).toBeNull();
    expect(loadDraft("user-b")).toMatchObject({ comments: "B" });
  });

  it("subscribes only to the selected user's cross-tab changes and cleans up", () => {
    const callback = vi.fn();
    const unsubscribe = subscribeDraftChanges("user-a", callback);
    const remote = storedDraft({ tabId: "other-tab", comments: "Cross-tab edit" });

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey("user-b"),
        newValue: JSON.stringify(remote),
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey("user-a"),
        newValue: "invalid json",
      }),
    );
    expect(callback).not.toHaveBeenCalled();

    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey("user-a"),
        newValue: JSON.stringify(remote),
      }),
    );
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey("user-a"),
        newValue: null,
      }),
    );
    expect(callback).toHaveBeenNthCalledWith(1, remote);
    expect(callback).toHaveBeenNthCalledWith(2, null);

    unsubscribe();
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: storageKey("user-a"),
        newValue: JSON.stringify(remote),
      }),
    );
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("recognises only meaningful user input beyond the default form state", () => {
    const empty = snapshot({
      goalkeeper: " ",
      coach: "",
      competition: "",
      team: " ",
      opponent: " ",
      matchDate: "",
      comments: " ",
      selectedMedia: [],
      scores: { ...DEFAULT_SCORES },
    });

    expect(isDraftMeaningful(empty)).toBe(false);
    expect(isDraftMeaningful({ ...empty, goalkeeper: "James Beadle" })).toBe(true);
    expect(isDraftMeaningful({ ...empty, selectedMedia: ["media-1"] })).toBe(true);
    expect(
      isDraftMeaningful({
        ...empty,
        scores: { ...DEFAULT_SCORES, protect_goal: 4 },
      }),
    ).toBe(true);
  });
});
