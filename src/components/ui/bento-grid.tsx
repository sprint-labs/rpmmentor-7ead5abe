import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The dashboard's placement vocabulary.
 *
 * Three tokens, named for the three content shapes the operational grid
 * actually holds rather than for their width, because the width is the
 * consequence and the content is the reason.
 */
export type BentoSize = "list" | "detail" | "matrix";

/**
 * The whole vocabulary, and the only place a column span may be written for
 * this grid.
 *
 * Every token carries `self-start`, which is the load-bearing class on this
 * page: without it a grid item's `align-self` resolves to `stretch`, and each
 * panel's ~130px pending/error/empty state is drawn as a ~500px void the size
 * of its tallest neighbour. Baking it into the tokens is what stops a call
 * site forgetting it.
 */
export const BENTO_SPAN: Record<BentoSize, string> = {
  /** Short rows — a proportional bar, a label, a count. Wants ~300px, gains nothing past ~470px. */
  list: "col-span-12 self-start lg:col-span-4",
  /** Multi-line rows, or a truncating metadata line that loses information when narrowed. */
  detail: "col-span-12 self-start lg:col-span-6",
  /** A fixed-aspect matrix, where width is paid for in height: every 100px of width buys ~85px of empty square. */
  matrix: "col-span-12 self-start max-w-[380px] lg:col-span-4",
};

/**
 * Placement classes for a cell whose root element belongs to someone else —
 * a component that owns its own root (CalendarMonthCard, GoalkeeperDistribution)
 * or a `<Link>` that cannot be wrapped without adding a node.
 *
 * Override semantics, verified against the installed tailwind-merge 3.6.0:
 * twMerge resolves a `col-span` conflict only within one modifier scope, so
 *   bentoSpan("detail", "lg:col-span-7") -> "col-span-12 self-start lg:col-span-7"
 *   bentoSpan("list", "md:col-span-6")   -> "col-span-12 self-start lg:col-span-4 md:col-span-6"
 * Adding a breakpoint tier is additive; replacing one needs the same prefix.
 */
export function bentoSpan(size: BentoSize, className?: string): string {
  return cn(BENTO_SPAN[size], className);
}

interface BentoGridProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  /** `section` when the grid carries `aria-labelledby` for a labelled region. */
  as?: "div" | "section";
  children: React.ReactNode;
}

/**
 * The twelve-column container the operational grid sits in.
 *
 * `auto-rows-min` is insurance rather than a visual change: today the row
 * tracks resolve identically with `auto`, because a non-stretched block item
 * contributes its own laid-out height. It matters the moment an ancestor gains
 * a definite block size — `align-content` would then distribute the free space
 * into `auto` tracks and silently re-stretch the rows. `min-content` tracks
 * never absorb free space.
 */
export function BentoGrid({ as: Tag = "div", className, children, ...rest }: BentoGridProps) {
  return (
    <Tag className={cn("grid grid-cols-12 auto-rows-min gap-4", className)} {...rest}>
      {children}
    </Tag>
  );
}

interface BentoCellProps extends Omit<React.HTMLAttributes<HTMLElement>, "children"> {
  size: BentoSize;
  as?: "div" | "section" | "article";
  children: React.ReactNode;
}

/**
 * One cell, sized to the shape of what it holds.
 *
 * The panel IS the cell: this renders a single element carrying both the
 * placement classes and the panel's own `command-panel` surface, at the same
 * DOM depth as the hand-spanned div it replaces. A wrapper node here would
 * either double the panel border or, sitting between grid and panel, swallow
 * the hover affordance `command-panel` defines.
 */
export function BentoCell({ size, as: Tag = "div", className, children, ...rest }: BentoCellProps) {
  return (
    <Tag className={bentoSpan(size, className)} {...rest}>
      {children}
    </Tag>
  );
}
