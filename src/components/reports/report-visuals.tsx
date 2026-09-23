/**
 * The visual vocabulary every match-report surface shares.
 *
 * The Submission Centre card, the full report and the insights pane each drew
 * a report their own way — one in the rating ramp, one in flat white numerals,
 * one in a single green — so the same 3/5 looked different on every screen.
 * They now draw from here, so a pillar, a score and a goalkeeper look the same
 * wherever a report is read.
 *
 * Colour still comes only from the two ramps that already exist: the rating
 * ramp (`scoreTone`) for anything that is a score, and the categorical club
 * ramp (`ClubCrest`) for telling clubs apart. Neither is used for the other.
 */
import { Avatar } from "@/components/primitives";
import { ClubCrest } from "@/components/club-crest";
import { initialsOf } from "@/lib/initials";
import { scoreTone, type ScoreBand } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import type { PillarId } from "@/lib/match-reports/schema";
import { BAND_LABEL, SHORT_PILLAR } from "@/lib/match-reports/report-display";

/** Outline for a chip in the band's colour. Written out for Tailwind's scanner. */
const BAND_BORDER: Record<ScoreBand, string> = {
  high: "border-rating-elite/40",
  good: "border-rating-strong/40",
  fair: "border-rating-average/40",
  low: "border-rating-poor/40",
  unknown: "border-border",
};

const PIPS = [1, 2, 3, 4, 5];

/** Five pips, filled to the score in its band colour. Decorative: the numeral carries it. */
export function PipBar({
  score,
  className,
  pipClassName = "h-1",
}: {
  score: number | null;
  className?: string;
  pipClassName?: string;
}) {
  const tone = scoreTone(score);
  const filled = score == null ? 0 : Math.round(score);
  return (
    <div aria-hidden="true" className={cn("flex gap-0.5", className)}>
      {PIPS.map((pip) => (
        <span
          key={pip}
          className={cn("flex-1 rounded-sm", pipClassName, pip <= filled ? tone.bar : "bg-border")}
        />
      ))}
    </div>
  );
}

/** One pillar at card size: its short name, a five-pip bar, and the numeral. */
export function PillarBar({ id, score }: { id: PillarId; score: number | null }) {
  const tone = scoreTone(score);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
          {SHORT_PILLAR[id]}
        </span>
        <span className={cn("font-mono text-[10px] font-bold tabular-nums", tone.ink)}>
          {score ?? "—"}
        </span>
      </div>
      <PipBar score={score} className="mt-1" />
    </div>
  );
}

/** "Strong", "Elite"… in the band's own colour, with a swatch. */
export function ScoreBandChip({ score, className }: { score: number | null; className?: string }) {
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        BAND_BORDER[tone.band],
        tone.ink,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", tone.bar)} />
      {BAND_LABEL[tone.band]}
    </span>
  );
}

/**
 * The goalkeeper's photo with his club's crest pinned to the corner.
 *
 * Falls back to his initials when there is no photo, which is most of the
 * roster signed since the seed was captured.
 */
export function PlayerPortrait({
  name,
  imageUrl,
  club,
  size = 88,
}: {
  name: string;
  imageUrl?: string;
  club: string | null;
  size?: number;
}) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span className="block rounded-full ring-2 ring-primary/50 ring-offset-2 ring-offset-card">
        <Avatar
          initials={initialsOf(name)}
          size={size}
          imageUrl={imageUrl || undefined}
          alt={`${name} portrait`}
        />
      </span>
      {club?.trim() ? (
        <ClubCrest
          club={club}
          size="sm"
          className={cn(
            "absolute -bottom-1 -right-1 shadow-md",
            // A full-size crest would cover half of a small portrait.
            size < 80 && "size-6 text-[8px]",
          )}
        />
      ) : null}
    </span>
  );
}
