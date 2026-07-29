import { useEffect, useState, useCallback } from "react";
import { CloudUpload, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { newSubmissionKey } from "@/lib/match-reports/duplicates";
import { submitMatchReport } from "@/lib/match-reports/reports.functions";
import {
  drainQueue,
  listJobs,
  subscribe,
  removeJob,
  NeedsUserActionError,
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
      // The submission key makes replay idempotent: if the original request
      // reached the server but the response was lost, the server returns the
      // existing row instead of appending a second one.
      const p = payload as { payload: unknown; submissionKey?: string };
      // Jobs queued before idempotency keys existed get one now; the ledger
      // still catches a genuine re-write via the fingerprint windows.
      const submissionKey = p.submissionKey || newSubmissionKey();
      const res = await submitFn({
        data: {
          payload: p.payload,
          options: {
            allowDuplicate: false,
            replay: true,
            submissionKey,
          },
        } as never,
      });
      if ((res as { status?: string })?.status === "duplicate") {
        // Needs an explicit human decision — keep the job, don't write.
        throw new NeedsUserActionError(
          (res as { message?: string }).message ?? "Duplicate report needs confirmation.",
        );
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
      if (res.needsAction > 0) {
        toast.warning(
          `${res.needsAction} queued report${res.needsAction === 1 ? "" : "s"} look like duplicates and need your confirmation.`,
        );
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

  const needsActionJobs = jobs.filter((j) => j.needsAction);
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
      {needsActionJobs.length > 0 && (
        <button
          type="button"
          onClick={() => {
            for (const j of needsActionJobs) removeJob(j.id);
            toast.message("Removed queued duplicates. Re-submit the report if it is genuinely new.");
            refresh();
          }}
          className="shrink-0 h-6 px-2 rounded border border-current/40 hover:bg-current/10"
        >
          {needsActionJobs.length} need{needsActionJobs.length === 1 ? "s" : ""} review — discard
        </button>
      )}
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
