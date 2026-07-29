import { useEffect, useState, useCallback } from "react";
import { CloudUpload, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { submitMatchReport } from "@/lib/match-reports/reports.functions";
import {
  drainQueue,
  listJobs,
  subscribe,
  type SyncHandler,
  type SyncJob,
} from "@/lib/sync/queue";

/**
 * Mounts once in the app shell. Watches connectivity + visibility and
 * drains the offline sync queue whenever we're back online. Shows a
 * compact pill when jobs are pending and toasts on success/failure.
 */
export function SyncManager() {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [syncing, setSyncing] = useState(false);

  const submitFn = useServerFn(submitMatchReport);

  const handlers: Record<string, SyncHandler> = {
    submitMatchReport: async (payload) => {
      // Replayed submits are stamped as such in the sheet's Source column, and
      // still run through the duplicate guard so a job that already landed
      // before the tab went offline can't be written twice.
      const p = payload as { payload: unknown };
      try {
        await submitFn({
          data: { payload: p.payload, options: { allowDuplicate: false, replay: true } } as never,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Already in the sheet — the original submit did land. Treat the job
        // as done rather than retrying it forever.
        if (/already exists for/i.test(msg)) return;
        throw e;
      }
    },
  };

  const refresh = useCallback(() => setJobs(listJobs()), []);

  const drain = useCallback(async () => {
    if (syncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if (listJobs().length === 0) return;
    setSyncing(true);
    try {
      const res = await drainQueue(handlers);
      if (res.processed > 0) {
        toast.success(
          res.processed === 1
            ? "Synced 1 queued change"
            : `Synced ${res.processed} queued changes`,
        );
        try {
          window.dispatchEvent(new CustomEvent("rpm:report-submitted"));
        } catch { /* ignore */ }
      }
      if (res.dropped > 0) {
        toast.error(
          `${res.dropped} queued change${res.dropped === 1 ? "" : "s"} could not be applied and were removed. Check the details and try again.`,
        );
      }
    } finally {
      setSyncing(false);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing, refresh]);

  // Initial + subscribe to queue changes.
  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  // Connectivity + visibility triggers.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const on = () => { setOnline(true); void drain(); };
    const off = () => setOnline(false);
    const vis = () => { if (document.visibilityState === "visible") void drain(); };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    document.addEventListener("visibilitychange", vis);
    // Attempt one drain on mount (e.g. reload after being offline).
    void drain();
    // Periodic retry while there are pending jobs.
    const timer = window.setInterval(() => { void drain(); }, 30_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      document.removeEventListener("visibilitychange", vis);
      window.clearInterval(timer);
    };
  }, [drain]);

  if (jobs.length === 0) return null;

  const anyFailed = jobs.some((j) => j.attempts > 0);
  const Icon = syncing ? RefreshCw : anyFailed && !online ? AlertTriangle : online ? Check : CloudUpload;
  const color = syncing
    ? "border-sky-500/40 bg-sky-500/10 text-sky-200"
    : anyFailed && !online
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : online
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
        : "border-border/60 bg-muted/40 text-muted-foreground";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-20 flex items-center justify-between gap-3 border-b px-4 py-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold ${color}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className={`size-3.5 shrink-0 ${syncing ? "animate-spin" : ""}`} />
        <span className="truncate">
          {syncing
            ? `Syncing ${jobs.length} queued change${jobs.length === 1 ? "" : "s"}…`
            : online
              ? `${jobs.length} queued change${jobs.length === 1 ? "" : "s"} — retrying automatically`
              : `${jobs.length} change${jobs.length === 1 ? "" : "s"} queued — will upload when online`}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void drain()}
        disabled={syncing || !online}
        className="shrink-0 h-6 px-2 rounded border border-current/40 hover:bg-current/10 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Retry now
      </button>
    </div>
  );
}
