/**
 * Goalkeeper Distribution — how the roster splits, and a way into each slice.
 *
 * Two questions, kept apart on purpose (see `roster-snapshot.ts`):
 *
 *   - **Tier distribution.** Tier 1–4 plus Unassigned, over the whole roster.
 *     Every goalkeeper is in exactly one row, so these counts sum to the roster
 *     and the percentages sum to 100%.
 *
 *   - **Status.** Academy and Free Agent, each counted against the whole roster
 *     on its own. A goalkeeper can hold a tier and a status at once, so these
 *     are not slices of the distribution and are not expected to sum to
 *     anything. The panel says so rather than leaving it to be inferred.
 *
 * Every row is a drill-down into `/goalkeepers` using the filters that page
 * already has — the same URL you would reach by clicking the filter yourself.
 * Since the roster now reads the same table these counts come from, the number
 * on the row and the number of results on the destination are the same number.
 */
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { SectionTitle } from "@/components/primitives";
import { cn } from "@/lib/utils";
import { UNASSIGNED_TIER_LABEL, type RosterSnapshot } from "@/lib/roster-snapshot";
import {
  searchForDistributionRow,
  type DistributionRowLabel,
} from "@/lib/roster-distribution-links";

/**
 * Bar and label colour per row.
 *
 * The four tiers take the care-cadence ramp. Unassigned takes the warning hue
 * because it is an outstanding decision, not a rung on that ladder. Academy and
 * Free Agent take category hues rather than borrowing a tier's green, so a
 * status never reads as a tier at a glance.
 */
const ROW_TONE: Record<string, { bar: string; label: string }> = {
  "Tier 1": { bar: "bg-tier-1", label: "text-tier-1 border-tier-1/40 bg-tier-1/15" },
  "Tier 2": { bar: "bg-tier-2", label: "text-tier-2 border-tier-2/40 bg-tier-2/15" },
  "Tier 3": { bar: "bg-tier-3", label: "text-tier-3 border-tier-3/40 bg-tier-3/15" },
  "Tier 4": { bar: "bg-tier-4", label: "text-tier-4 border-tier-4/40 bg-tier-4/15" },
  [UNASSIGNED_TIER_LABEL]: {
    bar: "bg-warning",
    label: "text-warning border-warning/40 bg-warning/15",
  },
  Academy: { bar: "bg-info", label: "text-info border-info/40 bg-info/15" },
  "Free Agent": {
    bar: "bg-muted-foreground/60",
    label: "text-muted-foreground border-border bg-muted",
  },
};

const FALLBACK_TONE = {
  bar: "bg-muted-foreground/60",
  label: "text-muted-foreground border-border bg-muted",
};

function DistributionRow({
  label,
  count,
  percent,
  pending,
}: {
  label: DistributionRowLabel;
  count: number | null;
  percent: number;
  pending: boolean;
}) {
  const tone = ROW_TONE[label] ?? FALLBACK_TONE;
  const width = pending || count == null ? 0 : Math.min(100, percent);

  return (
    <Link
      to="/goalkeepers"
      search={searchForDistributionRow(label)}
      aria-label={
        count == null
          ? `View ${label} goalkeepers`
          : `View ${count} ${label} goalkeepers, ${percent}% of the roster`
      }
      className="group flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span
        className={cn(
          "w-[86px] shrink-0 rounded border px-1.5 py-0.5 text-center text-[10px] font-medium",
          tone.label,
        )}
      >
        {label}
      </span>

      {/* Decorative: the count and percentage beside it carry the same value. */}
      <span aria-hidden="true" className="h-1.5 min-w-0 flex-1 rounded-full bg-muted/60">
        <span
          className={cn("block h-full rounded-full transition-[width]", tone.bar)}
          style={{ width: `${width}%` }}
        />
      </span>

      <span className="flex shrink-0 items-baseline gap-1.5 tabular-nums">
        <span className="font-mono text-base font-bold leading-none text-foreground">
          {pending || count == null ? "…" : count}
        </span>
        <span className="w-10 text-right font-mono text-[11px] text-muted-foreground">
          {pending || count == null ? "" : `${Math.round(percent)}%`}
        </span>
      </span>

      <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
    </Link>
  );
}

export function GoalkeeperDistribution({
  roster,
  pending,
  error,
}: {
  roster: RosterSnapshot | undefined;
  pending: boolean;
  error: boolean;
}) {
  return (
    <div className="col-span-12 self-start command-panel p-4 lg:col-span-4">
      <SectionTitle
        action={
          error ? null : (
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {pending ? "…" : `${roster?.total ?? 0} on roster`}
            </span>
          )
        }
      >
        Goalkeeper Distribution
      </SectionTitle>

      {error ? (
        <p className="mt-3 text-xs text-muted-foreground" role="status">
          The distribution didn't load. Refresh the page to try again.
        </p>
      ) : (
        <>
          <section className="mt-3" aria-labelledby="gk-tier-distribution">
            <h3
              id="gk-tier-distribution"
              className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"
            >
              By tier · {roster?.total ?? 0} goalkeepers
            </h3>
            <div className="space-y-0.5" aria-busy={pending}>
              {(roster?.tiers ?? []).map((row) => (
                <DistributionRow
                  key={row.label}
                  label={row.label}
                  count={pending ? null : row.count}
                  percent={row.percent}
                  pending={pending}
                />
              ))}
            </div>
          </section>

          <section
            className="mt-4 border-t border-border pt-3"
            aria-labelledby="gk-status-distribution"
          >
            <h3
              id="gk-status-distribution"
              className="mb-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground"
            >
              By status · share of all goalkeepers
            </h3>
            <div className="space-y-0.5" aria-busy={pending}>
              {(roster?.statuses ?? []).map((row) => (
                <DistributionRow
                  key={row.label}
                  label={row.label}
                  count={pending ? null : row.count}
                  percent={row.percent}
                  pending={pending}
                />
              ))}
            </div>
            {/* Said plainly, because two independent attributes counted against
                the same total look wrong to anyone expecting a pie chart. */}
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground/80">
              A goalkeeper can hold a tier and a status at once, so these are counted separately and
              do not add up to 100%.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
