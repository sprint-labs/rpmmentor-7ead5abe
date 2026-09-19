import { describe, it, expect } from "vitest";
import {
  describeDataFreshness,
  formatSyncedAt,
  oldestFetchedAt,
  STALE_AFTER_MS,
} from "@/lib/data-freshness";

/** 19 Sep 2026 15:31 London (BST, UTC+1). */
const SEP_19 = Date.parse("2026-09-19T14:31:00Z");
/** 15 Jan 2026 09:05 London (GMT, UTC+0) — the other side of the DST boundary. */
const JAN_15 = Date.parse("2026-01-15T09:05:00Z");

describe("formatSyncedAt", () => {
  it("renders an absolute London label with the year, as the header design asks for", () => {
    expect(formatSyncedAt(SEP_19)).toBe("19 Sep 2026, 15:31");
  });

  it("applies British Summer Time rather than UTC", () => {
    // 14:31Z is 15:31 in London in September. Rendering 14:31 would mean the
    // label was built from UTC and would be an hour wrong for half the year.
    expect(formatSyncedAt(SEP_19)).toContain("15:31");
    expect(formatSyncedAt(JAN_15)).toBe("15 Jan 2026, 09:05");
  });

  it("refuses to render a value that is not an instant", () => {
    expect(formatSyncedAt(0)).toBe("—");
    expect(formatSyncedAt(Number.NaN)).toBe("—");
  });
});

describe("oldestFetchedAt", () => {
  it("returns the oldest read, because a page is as stale as its worst panel", () => {
    expect(oldestFetchedAt([3000, 1000, 2000])).toBe(1000);
  });

  it("returns null when any query has never resolved", () => {
    // react-query reports 0 for a query that has not resolved. Treating that as
    // "ignore it and average the rest" is the optimistic reading this module
    // exists to prevent.
    expect(oldestFetchedAt([3000, 0, 2000])).toBeNull();
  });

  it("returns null for no queries at all", () => {
    expect(oldestFetchedAt([])).toBeNull();
  });
});

describe("describeDataFreshness", () => {
  it("reports the oldest read as an absolute timestamp", () => {
    const { label, tone } = describeDataFreshness({
      fetchedAt: [SEP_19 + 60_000, SEP_19],
      anyError: false,
      now: SEP_19 + 60_000,
    });
    expect(label).toBe("Last synced 19 Sep 2026, 15:31");
    expect(tone).toBe("fresh");
  });

  it("never claims a sync time when a panel has failed", () => {
    // The regression this guards: the shipped chip asserted "Up to date" while
    // the KPI card beside it was rendering a dash for a failed query.
    const { label, tone } = describeDataFreshness({
      fetchedAt: [SEP_19],
      anyError: true,
      now: SEP_19,
    });
    expect(label).toBe("Some figures didn't load");
    expect(tone).toBe("degraded");
    expect(label).not.toContain("Last synced");
  });

  it("says it is still checking rather than inventing a time before the first read", () => {
    const { label, tone } = describeDataFreshness({
      fetchedAt: [0, 0],
      anyError: false,
      now: SEP_19,
    });
    expect(tone).toBe("unknown");
    expect(label).not.toContain("Last synced");
    expect(label).not.toContain("Up to date");
  });

  it("marks a screen left open past the stale threshold", () => {
    const { tone } = describeDataFreshness({
      fetchedAt: [SEP_19],
      anyError: false,
      now: SEP_19 + STALE_AFTER_MS + 1,
    });
    expect(tone).toBe("stale");
  });

  it("puts the match-report store's own sync in the detail, never the headline", () => {
    // These are different questions. The store's delivery time must not be
    // presented as the freshness of the figures on screen.
    const { label, detail } = describeDataFreshness({
      fetchedAt: [SEP_19],
      anyError: false,
      reportsSyncedAt: "2026-09-18T12:38:42Z",
      now: SEP_19,
    });
    expect(label).toBe("Last synced 19 Sep 2026, 15:31");
    expect(detail).toContain("18 Sep 2026, 13:38");
  });

  it("explains what was measured even when there is no store timestamp", () => {
    const { detail } = describeDataFreshness({
      fetchedAt: [SEP_19],
      anyError: false,
      now: SEP_19,
    });
    expect(detail).toContain("read from the database");
  });
});
