import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Info, RefreshCw } from "lucide-react";
import type { DataFreshness } from "@/lib/data-freshness";

const TONE = {
  fresh: {
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    Icon: Check,
  },
  stale: {
    className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
    Icon: Clock,
  },
  degraded: {
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: AlertTriangle,
  },
  unknown: {
    className: "border-border/60 bg-muted/40 text-muted-foreground",
    Icon: RefreshCw,
  },
} as const;

/**
 * "Last synced …" for a page header, with the explanation behind an info
 * button rather than a `title` tooltip.
 *
 * A `title` is invisible on touch, which is where this app is mostly read, so
 * the caveat that most needs reading was the one nobody could see. This uses a
 * real toggle so the same text is reachable by tap, click and keyboard.
 */
export function DataFreshnessChip({
  freshness,
  className = "",
}: {
  freshness: DataFreshness;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const { className: tone, Icon } = TONE[freshness.tone];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={`relative inline-flex items-center gap-1 ${className}`}>
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex h-6 items-center gap-1.5 rounded border px-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}
      >
        <Icon className="size-3" />
        {freshness.label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="What does this time mean?"
        className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span
          role="note"
          className="absolute right-0 top-7 z-30 w-64 rounded-md border border-border bg-popover p-3 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-popover-foreground shadow-lg"
        >
          {freshness.detail}
        </span>
      )}
    </span>
  );
}
