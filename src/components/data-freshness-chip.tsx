import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Clock, Info, RefreshCw } from "lucide-react";
import type { DataFreshness } from "@/lib/data-freshness";

/**
 * Theme tokens, not raw palette steps, and outlined rather than washed.
 *
 * The first cut used `text-emerald-200` on `bg-emerald-500/10`. Those are
 * fixed Tailwind palette values with no idea which theme is on, so on the
 * light theme's near-white page the label was pale green on pale green and
 * effectively unreadable. The tokens below are defined per theme and proved
 * against every surface by the contrast test.
 *
 * No background wash either: a 10% wash of a label's own hue costs about a
 * point of contrast, which is why every other badge in this app is outlined.
 */
const TONE = {
  // Tier 2's green, not the success green: this chip sits in a header beside
  // tier badges and is read as one of them, so it takes their hue rather than
  // introducing a second green a hair off theirs.
  fresh: { className: "border-tier-2/40 text-tier-2", Icon: Check },
  stale: { className: "border-warning/40 text-warning", Icon: Clock },
  degraded: { className: "border-destructive/40 text-destructive", Icon: AlertTriangle },
  unknown: { className: "border-border text-muted-foreground", Icon: RefreshCw },
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
        // Set exactly as TierBadge is. The size was already 10px; what made this
        // read so much larger was uppercase, letter-spacing, semibold weight and a
        // fixed 24px height, none of which a tier badge beside it uses.
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
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
