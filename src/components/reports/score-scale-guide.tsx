/**
 * RPM's rating system, listed: what each pillar score means, 5 down to 1.
 *
 * Shown wherever a score is given or read (the Match Report form, the report
 * editor and the report page), always from the one definition in
 * `lib/match-reports/schema.ts`. Each score sits in its own colour on the
 * rating ramp, so the list is also the key to the colours around it.
 */
import { useId } from "react";
import { SCORE_SCALE } from "@/lib/match-reports/schema";
import { scoreTone } from "@/lib/score-band";
import { cn } from "@/lib/utils";

export function ScoreScaleGuide({ className }: { className?: string }) {
  const titleId = useId();
  return (
    <div role="group" aria-labelledby={titleId} className={className}>
      <div
        id={titleId}
        className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
      >
        Rating scale
      </div>
      <dl className="mt-1.5 grid gap-1">
        {SCORE_SCALE.map(({ score, meaning }) => (
          <div key={score} className="flex items-center gap-2">
            <dt
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-bold tabular-nums text-rating-ink",
                scoreTone(score).bar,
              )}
            >
              {score}
            </dt>
            <dd className="text-[11px] leading-snug text-foreground/90">{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
