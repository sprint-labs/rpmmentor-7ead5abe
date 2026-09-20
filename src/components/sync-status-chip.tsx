import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, WifiOff } from "lucide-react";
import { getLastSyncedAt, listJobs, subscribe, type SyncJob } from "@/lib/sync/queue";

/**
 * Compact state of THIS DEVICE'S OUTBOUND WRITE QUEUE — work created here that
 * has not reached the server yet. In priority order:
 *   Offline → Uploading → Retrying → Uploaded <time> ago → No unsent changes
 *
 * It is NOT a data-freshness indicator and must not be read as one. The value
 * behind it is written only when a queued job drains (`setLastSyncedAt` in
 * `@/lib/sync/queue`), so it stays empty for every user who has never
 * submitted while offline, and a value here says nothing about when the
 * figures on the page were last read. For that, use `DataFreshnessChip`, which
 * is driven by the page's own query fetch times.
 */
export function SyncStatusChip({ className = "" }: { className?: string }) {
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setJobs(listJobs());
      setLastSynced(getLastSyncedAt());
    };
    refresh();
    const unsub = subscribe(refresh);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Re-render every 30s so "2m ago" stays fresh.
    const t = window.setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => {
      unsub();
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.clearInterval(t);
    };
  }, []);

  const anyFailed = jobs.some((j) => j.attempts > 0);
  const pending = jobs.length;

  let label: string;
  let Icon = WifiOff;
  // Theme tokens, outlined — same reasoning as DataFreshnessChip.
  let tone = "border-border text-muted-foreground";

  if (!online && pending > 0) {
    label = `Offline · ${pending} unsent`;
    Icon = WifiOff;
    tone = "border-warning/40 text-warning";
  } else if (!online) {
    label = "Offline";
    Icon = WifiOff;
    tone = "border-warning/40 text-warning";
  } else if (pending > 0 && anyFailed) {
    label = `Retrying · ${pending} unsent`;
    Icon = AlertTriangle;
    tone = "border-warning/40 text-warning";
  } else if (pending > 0) {
    label = `Uploading · ${pending} unsent`;
    Icon = RefreshCw;
    tone = "border-info/40 text-info";
  } else {
    // Online with an empty queue is the normal state for almost everyone, and
    // it is not news: there is nothing for the reader to do about it and no
    // number it explains. Saying so anyway put a permanent chip in the header
    // that people read as a status for the figures on the page — which it is
    // not. It renders nothing, and reappears the moment there is something
    // genuinely unsent.
    return null;
  }

  const spinning = pending > 0 && !anyFailed && online;

  return (
    <span
      role="status"
      aria-live="polite"
      title={
        lastSynced
          ? `Last upload from this device: ${new Date(lastSynced).toLocaleString()}`
          : "Nothing created on this device is waiting to upload."
      }
      className={`inline-flex items-center gap-1.5 h-6 px-2 rounded border text-[10px] uppercase tracking-[0.08em] font-semibold ${tone} ${className}`}
    >
      <Icon className={`size-3 ${spinning ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 45) return "just now";
  if (s < 90) return "1m ago";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
