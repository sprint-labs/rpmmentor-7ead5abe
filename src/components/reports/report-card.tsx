/**
 * One match report, as a card.
 *
 * The list was eight columns of a table, which made every submission look like
 * the one above it and left most of the report invisible: `competition` and
 * all seven pillar scores are on every row returned by `listMatchReports` and
 * none of them reached the screen. A reader had to open a report to learn
 * anything beyond an average.
 *
 * So the card shows the work. The pillar scores are the substance of an RPM
 * report and they are what makes one submission different from another, so
 * they are on the face of it rather than a click away.
 *
 * Colour is carried by two ramps that already exist, and no third is invented:
 *
 *   - The rating ramp (`scoreTone`) on the average and on each pillar. It is
 *     the one GKHQ scoring ramp and the contrast suite already proves it AA on
 *     a card, so a weak pillar reads red and a strong one green with no new
 *     tokens and no new meanings.
 *   - The categorical ramp, via the club crest's ring and the card's rail, to
 *     tell one club from another. It never touches text, so a club's colour
 *     cannot be misread as a score.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight, NotebookPen } from "lucide-react";
import { ClubCrest, clubRail } from "@/components/club-crest";
import { TierBadge } from "@/components/primitives";
import { scoreTone } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import { PILLAR_IDS, type MatchReportRow, type PillarId } from "@/lib/match-reports/schema";
import type { Goalkeeper } from "@/lib/mock-data";

/**
 * Pillar names short enough to sit above a five-pip bar.
 *
 * `PILLAR_LABELS` is the formal wording ("Courage / Control / Intelligent /
 * Competitor") and stays the label on the report itself. At card width it
 * would wrap to four lines, so these are the same seven in one word each.
 */
const SHORT_PILLAR: Record<PillarId, string> = {
  protect_goal: "Goal",
  protect_space: "Space",
  protect_air: "Air",
  control_play: "Control",
  change_play: "Change",
  psych: "Mental",
  physical: "Physical",
};

const PIPS = [1, 2, 3, 4, 5];

/**
 * A match date a person would say out loud.
 *
 * Parsed into local parts rather than through `new Date(iso)`, which reads a
 * date-only value as UTC midnight and moves it to the previous day for anyone
 * west of UTC.
 */
function formatMatchDate(iso: string | null): string {
  if (!iso) return "Date not recorded";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** One pillar: its name, a five-pip bar, and the score as a numeral. */
function PillarBar({ id, score }: { id: PillarId; score: number | null }) {
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
      <div aria-hidden="true" className="mt-1 flex gap-0.5">
        {PIPS.map((pip) => (
          <span
            key={pip}
            className={cn(
              "h-1 flex-1 rounded-sm",
              score != null && pip <= score ? tone.bar : "bg-border",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function ReportCard({
  report,
  goalkeeper,
  canLogInteraction,
  onLogInteraction,
}: {
  report: MatchReportRow;
  /** The roster match for `report.goalkeeper`, when there is one. */
  goalkeeper: Goalkeeper | undefined;
  canLogInteraction: boolean;
  onLogInteraction: () => void;
}) {
  const average = scoreTone(report.average);
  const fixture = [report.team, report.opponent].filter(Boolean).join(" v ");

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/40">
      {/* The club's rail. Decoration: the club is named in the line below it. */}
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-1", clubRail(report.team))}
      />

      <div className="flex items-start gap-3 p-4 pl-5">
        <ClubCrest club={report.team} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {goalkeeper ? (
              <Link
                to="/goalkeepers/$gkId"
                params={{ gkId: goalkeeper.id }}
                className="truncate font-display text-base font-bold tracking-tight hover:underline"
              >
                {report.goalkeeper}
              </Link>
            ) : (
              <span className="truncate font-display text-base font-bold tracking-tight">
                {report.goalkeeper}
              </span>
            )}
            {goalkeeper && <TierBadge tier={goalkeeper.tier} />}
          </div>

          <p className="truncate text-xs text-muted-foreground">
            {fixture || "Fixture not recorded"}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatMatchDate(report.match_date)}
            {report.competition ? ` · ${report.competition}` : ""}
          </p>
        </div>

        {/* The headline number, in the same ramp the pillars below it use. */}
        <div className="shrink-0 text-right">
          <div
            className={cn("font-mono text-3xl font-bold leading-none tabular-nums", average.ink)}
          >
            {report.average != null ? report.average.toFixed(1) : "—"}
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-widest text-muted-foreground">
            Avg of 5
          </div>
        </div>
      </div>

      {/* The seven pillars. None of this reached the old table. */}
      <div className="grid grid-cols-4 gap-x-3 gap-y-2 border-t border-border/60 px-4 py-3 pl-5 sm:grid-cols-7">
        {PILLAR_IDS.map((id) => (
          <PillarBar key={id} id={id} score={report.scores[id]} />
        ))}
      </div>

      {report.comments.trim() && (
        <p className="border-t border-border/60 px-4 py-3 pl-5 text-xs leading-relaxed text-muted-foreground">
          <span className="line-clamp-2">{report.comments}</span>
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5 pl-5">
        <span className="truncate text-[11px] text-muted-foreground">
          {report.coach?.trim() ? `Reported by ${report.coach}` : "Mentor not recorded"}
        </span>
        <span className="inline-flex shrink-0 items-center gap-3">
          {canLogInteraction && (
            <button
              type="button"
              onClick={onLogInteraction}
              className="inline-flex min-h-8 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <NotebookPen className="size-3" />
              <span className="sr-only">Log an interaction for {report.goalkeeper}</span>
              <span aria-hidden="true">Log</span>
            </button>
          )}
          <Link
            to="/reports/$reportId"
            params={{ reportId: report.report_id }}
            className="inline-flex min-h-8 items-center gap-0.5 text-xs font-semibold text-primary-ink hover:underline"
          >
            <span className="sr-only">Open the report for {report.goalkeeper}</span>
            <span aria-hidden="true">Open</span>
            <ChevronRight className="size-3" />
          </Link>
        </span>
      </div>
    </article>
  );
}
