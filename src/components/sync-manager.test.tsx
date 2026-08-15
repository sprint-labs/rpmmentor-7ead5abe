// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queueMocks = vi.hoisted(() => ({
  drainQueue: vi.fn(),
  listJobs: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => {
    const chain: Record<string, unknown> = {};
    chain["middleware"] = () => chain;
    chain["validator"] = () => chain;
    chain["handler"] = (fn: unknown) => fn;
    return chain;
  },
  createMiddleware: () => {
    const chain: Record<string, unknown> = {};
    chain["server"] = () => chain;
    chain["client"] = () => chain;
    return chain;
  },
}));
vi.mock("@/lib/match-reports/reports.functions", () => ({ submitMatchReport: vi.fn() }));
vi.mock("@/lib/sync/queue", () => ({
  ...queueMocks,
  removeJob: vi.fn(),
  NeedsUserActionError: class NeedsUserActionError extends Error {},
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

import { SyncManager } from "./sync-manager";

const queuedJob = {
  id: "job-1",
  type: "submitMatchReport",
  payload: {},
  createdAt: "2026-08-15T10:00:00.000Z",
  attempts: 0,
};

function renderManager() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <SyncManager />
    </QueryClientProvider>,
  );
  return invalidate;
}

beforeEach(() => {
  queueMocks.listJobs.mockReturnValue([queuedJob]);
  queueMocks.drainQueue.mockReset();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SyncManager cache refresh", () => {
  it("invalidates coverage and follow-ups after a queued report is saved", async () => {
    queueMocks.drainQueue.mockResolvedValue({ processed: 1, failed: 0, dropped: 0, needsAction: 0 });
    const invalidate = renderManager();

    await waitFor(() => expect(queueMocks.drainQueue).toHaveBeenCalled());
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["calendar", "report-coverage"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["events", "follow-ups"] });
    });
  });

  it("does not invalidate report views when no queued change was saved", async () => {
    queueMocks.drainQueue.mockResolvedValue({ processed: 0, failed: 1, dropped: 0, needsAction: 0 });
    const invalidate = renderManager();

    await waitFor(() => expect(queueMocks.drainQueue).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["calendar", "report-coverage"] });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["events", "follow-ups"] });
  });
});
