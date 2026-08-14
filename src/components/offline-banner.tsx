import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { getLastSyncedAt, subscribe } from "@/lib/sync/queue";

export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [lastSynced, setLastSynced] = useState<number | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    setLastSynced(getLastSyncedAt());
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const unsub = subscribe(() => setLastSynced(getLastSyncedAt()));
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      unsub();
    };
  }, []);

  if (online) return null;

  const agoLabel = lastSynced ? formatAgo(lastSynced) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-30 flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold text-amber-200"
    >
      <WifiOff className="size-3.5" />
      Offline — showing last synced data
      {agoLabel && (
        <span className="opacity-80 normal-case tracking-normal font-normal">
          · last sync {agoLabel}
        </span>
      )}
    </div>
  );
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
