// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NeedsUserActionError,
  drainQueue,
  enqueueJob,
  getLastSyncedAt,
  listJobs,
  subscribe,
  type SyncJob,
} from "./queue";

const STORAGE_KEY = "rpm.sync-queue.v1";
const START = new Date("2026-08-21T00:00:00.000Z");

function seedJobs(jobs: SyncJob[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  window.localStorage.clear();
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => true,
  });
});

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("offline sync queue", () => {
  it("processes jobs in FIFO order, removes them, and records the last sync time", async () => {
    enqueueJob({ type: "report", payload: { order: 1 }, label: "first" });
    enqueueJob({ type: "report", payload: { order: 2 }, label: "second" });
    const order: string[] = [];

    const result = await drainQueue({
      report: async (_payload, job) => {
        order.push(job.label ?? "");
      },
    });

    expect(result).toEqual({ processed: 2, failed: 0, dropped: 0, needsAction: 0 });
    expect(order).toEqual(["first", "second"]);
    expect(listJobs()).toEqual([]);
    expect(getLastSyncedAt()).toBe(Date.now());
  });

  it("anchors exponential backoff to the most recent failed attempt", async () => {
    enqueueJob({ type: "report", payload: {} });
    vi.advanceTimersByTime(60_000);
    const handler = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });

    expect(await drainQueue({ report: handler })).toEqual({
      processed: 0,
      failed: 1,
      dropped: 0,
      needsAction: 0,
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(listJobs()[0]).toMatchObject({ attempts: 1, lastAttemptAt: Date.now() });

    await drainQueue({ report: handler });
    expect(handler).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(4_999);
    await drainQueue({ report: handler });
    expect(handler).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await drainQueue({ report: handler });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("keeps non-transient failures for review instead of deleting the job", async () => {
    enqueueJob({ type: "report", payload: {}, label: "Match report — permission case" });
    const handler = vi.fn(async () => {
      throw new Error("permission denied");
    });

    expect(await drainQueue({ report: handler })).toEqual({
      processed: 0,
      failed: 0,
      dropped: 0,
      needsAction: 1,
    });
    expect(listJobs()).toEqual([
      expect.objectContaining({
        attempts: 1,
        lastError: "permission denied",
        needsAction: true,
        label: "Match report — permission case",
      }),
    ]);

    await drainQueue({ report: handler });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("keeps a transient failure for review when automatic retries are exhausted", async () => {
    seedJobs([
      {
        id: "max-attempts",
        type: "report",
        payload: {},
        createdAt: Date.now() - 10 * 60_000,
        attempts: 7,
        lastAttemptAt: Date.now() - 10 * 60_000,
      },
    ]);

    expect(
      await drainQueue({
        report: async () => {
          throw new Error("Failed to fetch");
        },
      }),
    ).toEqual({ processed: 0, failed: 0, dropped: 0, needsAction: 1 });
    expect(listJobs()[0]).toMatchObject({ attempts: 8, needsAction: true });
  });

  it("keeps explicit user-decision failures and never retries them automatically", async () => {
    enqueueJob({ type: "report", payload: {} });
    const handler = vi.fn(async () => {
      throw new NeedsUserActionError("Duplicate confirmation required");
    });

    expect(await drainQueue({ report: handler })).toEqual({
      processed: 0,
      failed: 0,
      dropped: 0,
      needsAction: 1,
    });
    expect(listJobs()[0]).toMatchObject({
      needsAction: true,
      lastError: "Duplicate confirmation required",
    });

    await drainQueue({ report: handler });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("leaves unknown job types queued for a future release", async () => {
    enqueueJob({ type: "future-handler", payload: { version: 2 } });

    expect(await drainQueue({})).toEqual({
      processed: 0,
      failed: 0,
      dropped: 0,
      needsAction: 0,
    });
    expect(listJobs()).toHaveLength(1);
  });

  it("removes both queue listeners when a subscriber unsubscribes", () => {
    const callback = vi.fn();
    const unsubscribe = subscribe(callback);

    window.dispatchEvent(new CustomEvent("rpm:sync-queue-changed"));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(callback).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new CustomEvent("rpm:sync-queue-changed"));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
