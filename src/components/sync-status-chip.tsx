import { useEffect, useState } from "react";
import { Check, CloudUpload, RefreshCw, AlertTriangle, WifiOff } from "lucide-react";
import { getLastSyncedAt, listJobs, subscribe, type SyncJob } from "@/lib/sync/queue";

/**
 * Compact sync-state chip. Reflects, in order of priority:
 *   Offline → Syncing → Queued (n) → Failed → Synced <time> ago → Up to date
 * Meant for page headers and status bars.
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
  let Icon = Check;
  let tone = "border-border/60 bg-muted/40 text-muted-foreground";

  if (!online && pending > 0) {
    label = `Offline · ${pending} queued`;
    Icon = WifiOff;
    tone = "border-amber-500/40 bg-amber-500/10 text-amber-200";
  } else if (!online) {
    label = "Offline";
    Icon = WifiOff;
    tone = "border-amber-500/40 bg-amber-500/10 text-amber-200";
  } else if (pending > 0 && anyFailed) {
    label = `Retrying · ${pending} queued`;
    Icon = AlertTriangle;
    tone = "border-amber-500/40 bg-amber-500/10 text-amber-200";
  } else if (pending > 0) {
    label = `Syncing · ${pending} queued`;
    Icon = RefreshCw;
    tone = "border-sky-500/40 bg-sky-500/10 text-sky-200";
  } else if (lastSynced) {
    label = `Synced ${formatAgo(lastSynced)}`;
    Icon = Check;
    tone = "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  } else {
    label = "Up to date";
    Icon = CloudUpload;
  }

  const spinning = pending > 0 && !anyFailed && online;

  return (
    <span
      role="status"
      aria-live="polite"
      title={
        lastSynced ? `Last successful sync: ${new Date(lastSynced).toLocaleString()}` : undefined
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
