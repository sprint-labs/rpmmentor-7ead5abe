/**
 * Offline sync queue.
 *
 * A tiny localStorage-backed FIFO of pending server calls that could not
 * reach the network. When connectivity returns (browser `online` event,
 * tab focus, or a periodic tick) the SyncManager drains the queue by
 * invoking the registered handler for each job's `type`.
 *
 * Jobs are opaque to the queue itself — callers provide a `type` string
 * and a JSON-serialisable `payload`. A handler function performs the
 * actual server call (typically a `createServerFn`) and either resolves
 * (job removed) or throws (job kept, `attempts` incremented, retried
 * later with backoff).
 */

export type SyncJob = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
  userId?: string;
  /** Free-form label shown in the UI (e.g. "Match report — Beadle vs Blackburn"). */
  label?: string;
  /**
   * The server refused the job pending an explicit user decision (e.g. a
   * duplicate confirmation). The job is kept, never auto-retried, and never
   * silently submitted — the UI must surface it.
   */
  needsAction?: boolean;
};

/**
 * Thrown by a handler when the job cannot proceed without a user decision.
 * The queue keeps the job and flags it instead of retrying or dropping it.
 */
export class NeedsUserActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NeedsUserActionError";
  }
}

const KEY = "rpm.sync-queue.v1";
const LAST_SYNC_KEY = "rpm.sync-queue.last-synced";
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 5_000;

export function getLastSyncedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_KEY);
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

function setLastSyncedAt(ts: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, String(ts));
    window.dispatchEvent(new CustomEvent("rpm:sync-queue-changed"));
  } catch {
    /* ignore */
  }
}

function read(): SyncJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SyncJob[]) : [];
  } catch {
    return [];
  }
}

function write(jobs: SyncJob[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(jobs));
    window.dispatchEvent(new CustomEvent("rpm:sync-queue-changed"));
  } catch {
    /* quota exhausted — best effort */
  }
}

export function listJobs(): SyncJob[] {
  return read();
}

export function enqueueJob(job: Omit<SyncJob, "id" | "createdAt" | "attempts">): SyncJob {
  const created: SyncJob = {
    ...job,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    attempts: 0,
  };
  write([...read(), created]);
  return created;
}

export function removeJob(id: string) {
  write(read().filter((j) => j.id !== id));
}

export function clearAllJobs() {
  write([]);
}

function updateJob(id: string, patch: Partial<SyncJob>) {
  write(read().map((j) => (j.id === id ? { ...j, ...patch } : j)));
}

/** Exponential backoff based on `attempts`. */
function nextRetryAt(job: SyncJob): number {
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, job.attempts - 1), 5 * 60_000);
  return job.createdAt + delay;
}

export type SyncHandler = (payload: unknown, job: SyncJob) => Promise<void>;

/**
 * Distinguish "network is down / server unreachable" from real logical
 * failures (bad payload, permission denied). Only the former should be
 * retried — logical failures are dropped so we don't spin forever on a
 * broken job. This heuristic mirrors what fetch throws when offline.
 */
function isTransient(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /network|failed to fetch|load failed|timeout|fetch|econn|offline/i.test(msg);
}

export async function drainQueue(handlers: Record<string, SyncHandler>): Promise<{
  processed: number;
  failed: number;
  dropped: number;
  needsAction: number;
}> {
  const jobs = read();
  let processed = 0;
  let failed = 0;
  let dropped = 0;
  let needsAction = 0;
  const now = Date.now();

  for (const job of jobs) {
    // Awaiting an explicit user decision — never auto-submit or drop.
    if (job.needsAction) continue;
    if (job.attempts > 0 && nextRetryAt(job) > now) continue;
    const handler = handlers[job.type];
    if (!handler) {
      // Unknown type — leave for a future release that knows how to run it.
      continue;
    }
    try {
      await handler(job.payload, job);
      removeJob(job.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof NeedsUserActionError) {
        updateJob(job.id, { needsAction: true, lastError: message });
        needsAction += 1;
        continue;
      }
      if (!isTransient(err) || job.attempts + 1 >= MAX_ATTEMPTS) {
        removeJob(job.id);
        dropped += 1;
      } else {
        updateJob(job.id, { attempts: job.attempts + 1, lastError: message });
        failed += 1;
      }
    }
  }

  if (processed > 0) setLastSyncedAt(Date.now());
  return { processed, failed, dropped, needsAction };
}

export function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("rpm:sync-queue-changed", handler);
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) cb();
  });
  return () => {
    window.removeEventListener("rpm:sync-queue-changed", handler);
  };
}
