import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The Media Library's shelf pieces — heading, sideways-scrolling track and
 * loading skeleton — shared so Match Clips looks like the same product.
 */

export function ShelfHeader({
  title,
  subtitle,
  count,
  onViewAll,
  action,
}: {
  title: string;
  subtitle: string | null;
  count: number;
  onViewAll?: () => void;
  /** Extra control on the right of the heading, e.g. "Add clips". */
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex min-w-0 items-baseline gap-2">
        <span className="truncate font-display text-base font-bold uppercase tracking-[0.04em]">
          {title}
        </span>
        {subtitle && (
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            · {subtitle}
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {action}
      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          View all
          <ArrowRight className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * A sideways-scrolling shelf. The edge arrows are for pointer devices —
 * touch users already swipe, and the track keeps its native scrolling either way.
 */
export function ShelfTrack({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const syncEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft >= max - 4);
  }, []);

  // No dependency list: the shelf's contents change with the filters, and
  // scrollWidth only settles after that render.
  useEffect(syncEdges);

  useEffect(() => {
    window.addEventListener("resize", syncEdges);
    return () => window.removeEventListener("resize", syncEdges);
  }, [syncEdges]);

  const nudge = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(220, el.clientWidth * 0.8) * direction;
    if (typeof el.scrollBy === "function") el.scrollBy({ left: step, behavior: "smooth" });
    else el.scrollLeft += step;
  };

  const arrow =
    "absolute top-[30%] z-[1] hidden size-8 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-opacity [@media(any-pointer:fine)]:grid";

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Scroll shelf left"
        onClick={() => nudge(-1)}
        className={cn(arrow, "-left-2", atStart ? "pointer-events-none opacity-0" : "opacity-100")}
      >
        <ChevronLeft className="size-4" />
      </button>
      <div
        ref={trackRef}
        onScroll={syncEdges}
        className="flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label="Scroll shelf right"
        onClick={() => nudge(1)}
        className={cn(arrow, "-right-2", atEnd ? "pointer-events-none opacity-0" : "opacity-100")}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function ShelfSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {[0, 1].map((row) => (
        <div key={row}>
          <div className="mb-3 h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-[168px] shrink-0 sm:w-[196px]">
                <div className="aspect-[4/3] animate-pulse rounded-md bg-muted" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted" />
                <div className="mt-1.5 h-3 w-2/5 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
