import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, Quote, Target, TrendingUp, UserRound } from "lucide-react";
import { InsightWorkbench } from "@/components/insight-workbench";
import { ClubCrest } from "@/components/club-crest";
import { TierBadge } from "@/components/primitives";
import { PipBar, PlayerPortrait, ScoreBandChip } from "@/components/reports/report-visuals";
import { BAND_COLOR, BAND_LABEL, SHORT_PILLAR } from "@/lib/match-reports/report-display";
import { initialsOf } from "@/lib/initials";
import { normalisePersonName } from "@/lib/goalkeeper-player-link";
import { isValidScore, pillarStandouts } from "@/lib/match-reports/goalkeeper-form";
import { scoreTone, type ScoreBand } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import type { Goalkeeper } from "@/lib/mock-data";
import {
  PILLAR_IDS,
  PILLAR_LABELS,
  type MatchReportRow,
  type PillarId,
} from "@/lib/match-reports/schema";

interface MatchReportWorkbenchProps {
  reports: MatchReportRow[];
  periodLabel: string;
  /**
   * The live roster, for each goalkeeper's photo and tier. Optional: without
   * it the pane falls back to initials and simply leaves the tier off.
   */
  goalkeepers?: Goalkeeper[];
}

/** "2026-09-05" -> "05 Sept 2026"; anything unparseable is shown as-is. */
function formatMatchDate(value: string | null | undefined): string {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fixtureLabel(report: MatchReportRow): string {
  const home = report.team?.trim();
  const away = report.opponent?.trim();
  if (home && away) return `${home} v ${away}`;
  return home || away || "Fixture not recorded";
}

/** Bands in ramp order, for the score-spread bar. */
const SPREAD_BANDS: ScoreBand[] = ["high", "good", "fair", "low"];

/**
 * The period's reports as one bar split by rating band, so the mix of good and
 * hard days reads before any number does.
 */
function ScoreSpread({ reports }: { reports: MatchReportRow[] }) {
  const counts = SPREAD_BANDS.map((band) => ({
    band,
    count: reports.filter(
      (report) => isValidScore(report.average) && scoreTone(report.average).band === band,
    ).length,
  }));
  const total = counts.reduce((sum, { count }) => sum + count, 0);
  if (total === 0) return <span className="text-muted-foreground">No scored reports</span>;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
        {counts.map(({ band, count }) =>
          count > 0 ? (
            <span
              key={band}
              style={{ width: `${(count / total) * 100}%`, backgroundColor: BAND_COLOR[band] }}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-normal text-muted-foreground">
        {counts.map(({ band, count }) => (
          <li key={band} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ backgroundColor: BAND_COLOR[band] }}
            />
            {`${BAND_LABEL[band]} ${count}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Seven slim bars, one per pillar, as tall as the score. Decorative. */
function PillarStrip({ report }: { report: MatchReportRow }) {
  return (
    <span aria-hidden="true" className="mt-1.5 flex h-3.5 items-end justify-end gap-0.5">
      {PILLAR_IDS.map((id) => {
        const score = report.scores[id];
        return (
          <span
            key={id}
            className={cn(
              "w-1.5 rounded-[2px]",
              isValidScore(score) ? scoreTone(score).bar : "bg-border",
            )}
            style={{ height: `${isValidScore(score) ? (score / 5) * 100 : 20}%` }}
          />
        );
      })}
    </span>
  );
}

function PillarTile({ pillar, score }: { pillar: PillarId; score: number | null }) {
  const tone = scoreTone(score);
  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-xs leading-snug text-muted-foreground">
          {PILLAR_LABELS[pillar]}
        </span>
        <span className={cn("shrink-0 font-mono text-sm font-bold tabular-nums", tone.ink)}>
          {score != null ? `${score}/5` : "—"}
        </span>
      </div>
      <PipBar score={score} className="mt-2 gap-1" pipClassName="h-1.5" />
    </li>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 flex min-w-0 items-center gap-2 break-words text-sm text-foreground">
        {children}
      </dd>
    </div>
  );
}

export function MatchReportWorkbench({
  reports,
  periodLabel,
  goalkeepers = [],
}: MatchReportWorkbenchProps) {
  const rosterByName = useMemo(() => {
    const index = new Map<string, Goalkeeper>();
    for (const gk of goalkeepers) index.set(normalisePersonName(gk.name), gk);
    return index;
  }, [goalkeepers]);
  const goalkeeperOf = (report: MatchReportRow) =>
    rosterByName.get(normalisePersonName(report.goalkeeper));

  return (
    <InsightWorkbench<MatchReportRow>
      items={reports}
      idOf={(report) => report.report_id}
      domId="selected-report-detail"
      headingId="selected-report-heading"
      listLabel="Match reports in period"
      searchLabel="Search match reports"
      searchPlaceholder="Search goalkeeper, fixture or comments"
      searchFieldsOf={(report) => [
        report.goalkeeper,
        report.coach,
        report.team,
        report.opponent,
        report.competition,
        report.comments,
      ]}
      filters={[
        {
          id: "team",
          label: "Filter by team",
          allLabel: "All teams",
          optionsOf: (items) =>
            [...new Set(items.map((report) => report.team ?? "").filter(Boolean))].sort(),
          matches: (report, value) => (report.team ?? "") === value,
        },
        {
          id: "mentor",
          label: "Filter by mentor",
          allLabel: "All mentors",
          optionsOf: (items) =>
            [...new Set(items.map((report) => report.coach).filter(Boolean))].sort(),
          matches: (report, value) => report.coach === value,
        },
      ]}
      tiles={(visible, all) => {
        const scored = visible.filter((report) => report.average != null);
        const average = scored.length
          ? scored.reduce((total, report) => total + (report.average ?? 0), 0) / scored.length
          : null;
        const averageTone = scoreTone(average);
        const top = scored.reduce<MatchReportRow | null>(
          (best, report) => (!best || (report.average ?? 0) > (best.average ?? 0) ? report : best),
          null,
        );
        const topTone = scoreTone(top?.average);
        return [
          {
            label: "Reports",
            mono: true,
            accent: "var(--primary)",
            value: (
              <>
                {visible.length}
                {visible.length !== all.length ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    of {all.length}
                  </span>
                ) : null}
              </>
            ),
            caption: periodLabel,
          },
          {
            label: "Average score",
            mono: true,
            accent: BAND_COLOR[averageTone.band],
            valueClassName: averageTone.ink,
            value: average != null ? average.toFixed(2) : "—",
            caption: <PipBar score={average} className="w-28 gap-1" pipClassName="h-1" />,
          },
          {
            label: "Top rated",
            accent: BAND_COLOR[topTone.band],
            value: top ? (
              <span className="block truncate font-display font-bold">{top.goalkeeper}</span>
            ) : (
              "—"
            ),
            caption: top ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn("font-mono font-bold tabular-nums", topTone.ink)}>
                  {top.average?.toFixed(1)}
                </span>
                <span className="truncate">{fixtureLabel(top)}</span>
              </span>
            ) : undefined,
          },
          {
            label: "Score spread",
            value: <ScoreSpread reports={visible} />,
          },
        ];
      }}
      rowAriaLabel={(report) =>
        `Show details for ${report.goalkeeper} on ${formatMatchDate(report.match_date)}`
      }
      rowOf={(report) => ({
        initials: initialsOf(report.goalkeeper),
        leading: <ClubCrest club={report.team} size="sm" />,
        title: report.goalkeeper,
        subtitle: fixtureLabel(report),
        middleTop: report.coach || "Mentor not recorded",
        // Yellow marks the mentor's written verdict — the part worth reading.
        middleBottom:
          report.comments.trim() || report.competition?.trim() || "No comments recorded",
        middleBottomHighlighted: Boolean(report.comments.trim()),
        rightTop: report.average != null ? report.average.toFixed(2) : "—",
        rightTopClassName: cn("text-sm font-bold", scoreTone(report.average).ink),
        rightBottom: formatMatchDate(report.match_date),
        rightExtra: <PillarStrip report={report} />,
      })}
      detailHeader={(report) => {
        const gk = goalkeeperOf(report);
        return {
          leading: (
            <PlayerPortrait
              name={report.goalkeeper}
              imageUrl={gk?.profileImage}
              club={report.team}
              size={64}
            />
          ),
          title: report.goalkeeper,
          subtitle: `${fixtureLabel(report)} · ${formatMatchDate(report.match_date)}`,
          rightValue: report.average != null ? report.average.toFixed(2) : "—",
          rightValueClassName: scoreTone(report.average).ink,
          rightLabel: "Av score",
        };
      }}
      renderDetail={(report) => {
        const gk = goalkeeperOf(report);
        const { strongest, focus } = pillarStandouts(report.scores);
        return (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ScoreBandChip score={report.average} />
              {gk ? <TierBadge tier={gk.tier} /> : null}
              {strongest ? (
                <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <TrendingUp className="size-3 text-success" aria-hidden="true" />
                  Best: {SHORT_PILLAR[strongest.id]}
                </span>
              ) : null}
              {focus ? (
                <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  <Target className="size-3 text-warning" aria-hidden="true" />
                  Work on: {SHORT_PILLAR[focus.id]}
                </span>
              ) : null}
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 rounded-lg border border-border bg-card p-3.5 sm:grid-cols-3">
              <Fact label="Mentor">
                <UserRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 truncate">{report.coach || "Not recorded"}</span>
              </Fact>
              <Fact label="Team">
                <ClubCrest club={report.team} size="sm" className="size-6 text-[8px]" />
                <span className="min-w-0 truncate">{report.team?.trim() || "Not recorded"}</span>
              </Fact>
              <Fact label="Opponent">
                <ClubCrest club={report.opponent} size="sm" className="size-6 text-[8px]" />
                <span className="min-w-0 truncate">
                  {report.opponent?.trim() || "Not recorded"}
                </span>
              </Fact>
              <Fact label="Competition">
                <span className="min-w-0 truncate">
                  {report.competition?.trim() || "Not recorded"}
                </span>
              </Fact>
              <Fact label="Match date">
                <span className="min-w-0 truncate">{formatMatchDate(report.match_date)}</span>
              </Fact>
            </dl>

            <section className="mt-5" aria-labelledby="selected-report-pillars">
              <h3
                id="selected-report-pillars"
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
              >
                RPM pillar scores
              </h3>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {PILLAR_IDS.map((pillar) => (
                  <PillarTile key={pillar} pillar={pillar} score={report.scores[pillar] ?? null} />
                ))}
              </ul>
            </section>

            <section
              className="relative mt-5 overflow-hidden rounded-lg border border-border bg-card p-4"
              aria-labelledby="selected-report-comments"
            >
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
              <Quote
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-3 size-8 text-primary-ink/20"
              />
              <h3
                id="selected-report-comments"
                className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
              >
                Mentor's verdict
              </h3>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                {report.comments || "No comments recorded."}
              </p>
            </section>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/reports/$reportId"
                params={{ reportId: report.report_id }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Open full report <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
              {gk ? (
                <Link
                  to="/goalkeepers/$gkId"
                  params={{ gkId: gk.id }}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
                >
                  Goalkeeper profile
                </Link>
              ) : null}
            </div>
          </>
        );
      }}
      noMatchLabel="No match reports match these filters."
      placeholder="Select a match report to review its complete record."
    />
  );
}
