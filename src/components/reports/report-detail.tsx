/**
 * The sections of the full match report page.
 *
 * The page used to be a title, a paragraph and a list of seven "n/5" numerals:
 * everything the Submission Centre card shows in colour, shown here in grey,
 * and nothing about the goalkeeper the report is on. These sections put the
 * goalkeeper at the top — photo, club, tier — and read the match against his
 * own record, so a mentor opening a report sees what the score means as well
 * as what it is.
 *
 * Presentation only. The route owns the queries, the editor and the delete
 * flow; everything here renders from props.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Minus,
  PenLine,
  Quote,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Avatar, TierBadge } from "@/components/primitives";
import { ClubCrest, clubRail } from "@/components/club-crest";
import { PipBar, PlayerPortrait, ScoreBandChip } from "@/components/reports/report-visuals";
import { ScoreScaleGuide } from "@/components/reports/score-scale-guide";
import { BAND_COLOR, formatMatchDate } from "@/lib/match-reports/report-display";
import { initialsOf } from "@/lib/initials";
import { flagFor } from "@/lib/nationality-flag";
import { scoreTone, type ScoreBand } from "@/lib/score-band";
import { cn } from "@/lib/utils";
import type { Goalkeeper, Tier } from "@/lib/mock-data";
import {
  isValidScore,
  pillarStandouts,
  type GoalkeeperForm,
} from "@/lib/match-reports/goalkeeper-form";
import {
  PILLAR_IDS,
  PILLAR_LABELS,
  averageMeaning,
  type MatchReportRow,
  type PillarId,
} from "@/lib/match-reports/schema";

/** A card-shaped section with the small mono heading every section uses. */
function Panel({
  title,
  aside,
  className,
  children,
}: {
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] font-mono text-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** "+0.4" / "−0.6" / "±0", signed the way a person reads a change. */
function signed(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded === 0) return "±0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

/** A change against the goalkeeper's own average: up is green, down amber. */
export function DeltaChip({ delta, title }: { delta: number | null; title?: string }) {
  if (delta == null) return null;
  const rounded = Math.round(delta * 10) / 10;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-mono text-[11px] font-semibold tabular-nums",
        rounded > 0
          ? "bg-success/10 text-success"
          : rounded < 0
            ? "bg-warning/10 text-warning"
            : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {signed(delta)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export function ReportHero({
  report,
  goalkeeper,
}: {
  report: MatchReportRow;
  /** The roster record for this goalkeeper, when the name resolves to one. */
  goalkeeper: Goalkeeper | undefined;
}) {
  const tone = scoreTone(report.average);
  const team = report.team?.trim() || null;
  const opponent = report.opponent?.trim() || null;

  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-card">
      {/* The club's rail, as on the Submission Centre card. */}
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-1.5", clubRail(report.team))}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hero-grid opacity-40"
      />
      {/* A wash in the band's colour behind the score: green for a big day,
          amber for a hard one. Decoration — the band is also written out. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(55% 120% at 100% 0%, color-mix(in oklab, ${BAND_COLOR[tone.band]} 20%, transparent), transparent 70%)`,
        }}
      />

      <div className="relative grid gap-5 p-5 pl-6 sm:p-6 sm:pl-8 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <PlayerPortrait
          name={report.goalkeeper}
          imageUrl={goalkeeper?.profileImage}
          club={report.team}
          size={96}
        />

        <div className="min-w-0">
          <div className="gk-stat-label">Match report</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="break-words font-display text-2xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
              {report.goalkeeper}
            </h1>
            {goalkeeper && <TierBadge tier={goalkeeper.tier} />}
            {goalkeeper?.tags.map((tag) => (
              <TierBadge key={tag} tier={tag as Tier} />
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-2 font-display text-sm font-semibold sm:text-base">
            <span className="inline-flex min-w-0 items-center gap-2">
              <ClubCrest club={team} size="sm" />
              <span className="truncate">{team ?? "Team not recorded"}</span>
            </span>
            <span className="text-xs font-normal uppercase tracking-widest text-muted-foreground">
              v
            </span>
            <span className="inline-flex min-w-0 items-center gap-2">
              <ClubCrest club={opponent} size="sm" />
              <span className="truncate">{opponent ?? "Opponent not recorded"}</span>
            </span>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatMatchDate(report.match_date)}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Trophy className="size-3.5" aria-hidden="true" />
              {report.competition?.trim() || "Competition not recorded"}
            </li>
            <li className="inline-flex items-center gap-1.5">
              <PenLine className="size-3.5" aria-hidden="true" />
              {report.coach?.trim() ? `Reported by ${report.coach}` : "Mentor not recorded"}
            </li>
          </ul>

          {goalkeeper && (
            <Link
              to="/goalkeepers/$gkId"
              params={{ gkId: goalkeeper.id }}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-ink hover:underline"
            >
              View goalkeeper profile <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          )}
        </div>

        <div className="border-t border-border/60 pt-4 md:border-t-0 md:pt-0 md:text-right">
          <div className="gk-stat-label">Match rating</div>
          <div className="mt-1 flex items-baseline gap-1 md:justify-end">
            <span
              className={cn(
                "font-mono text-6xl font-bold leading-none tabular-nums tracking-tight",
                tone.ink,
              )}
            >
              {report.average != null ? report.average.toFixed(1) : "—"}
            </span>
            <span className="font-mono text-sm text-muted-foreground">/5</span>
          </div>
          <div className="mt-2.5 flex md:justify-end">
            <ScoreBandChip score={report.average} />
          </div>
          <PipBar
            score={report.average}
            className="mt-3 w-44 gap-1 md:ml-auto"
            pipClassName="h-1.5"
          />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Player snapshot
// ---------------------------------------------------------------------------

function StatTile({
  label,
  value,
  caption,
  captionWraps = false,
  band,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  /** Let a caption that must be read in full wrap instead of truncating. */
  captionWraps?: boolean;
  /** Paints the tile's top edge in the rating ramp when the value is a score. */
  band?: ScoreBand;
  valueClassName?: string;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card px-4 py-3">
      {band && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ backgroundColor: BAND_COLOR[band] }}
        />
      )}
      <div className="gk-stat-label truncate">{label}</div>
      <div
        className={cn(
          "mt-1.5 truncate font-mono text-2xl font-bold leading-none tabular-nums",
          valueClassName,
        )}
      >
        {value}
      </div>
      {caption ? (
        <div
          className={cn(
            "mt-1.5 text-[11px] text-muted-foreground",
            captionWraps ? "leading-snug" : "truncate",
          )}
        >
          {caption}
        </div>
      ) : null}
    </div>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * High-level stats on the goalkeeper, beside the report: his averages, how this
 * match compares, and the roster facts that say who he is.
 */
export function PlayerSnapshot({
  report,
  form,
  goalkeeper,
}: {
  report: MatchReportRow;
  form: GoalkeeperForm;
  goalkeeper: Goalkeeper | undefined;
}) {
  const overall = scoreTone(form.overallAverage);
  const last5 = scoreTone(form.last5Average);
  const delta =
    isValidScore(report.average) && form.averageBaseline != null
      ? report.average - form.averageBaseline
      : null;
  const flag = flagFor(goalkeeper?.nationality ?? "");

  return (
    <section
      aria-label="Goalkeeper snapshot"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
    >
      <StatTile
        label="RPM average"
        band={overall.band}
        valueClassName={overall.ink}
        value={form.overallAverage != null ? form.overallAverage.toFixed(1) : "—"}
        caption={`Across ${plural(form.reports.length, "report", "reports")}`}
      />
      <StatTile
        label="Last 5 average"
        band={last5.band}
        valueClassName={last5.ink}
        value={form.last5Average != null ? form.last5Average.toFixed(1) : "—"}
        caption="Most recent five reports"
      />
      <StatTile
        label="This match"
        value={delta != null ? <DeltaChipLarge delta={delta} /> : "—"}
        caption={
          delta != null
            ? `vs ${plural(form.baselineCount, "other report", "other reports")}`
            : "First report on record"
        }
      />
      <StatTile
        label="Reports filed"
        value={form.reports.length}
        caption={averageMeaning(form.overallAverage) ?? "No scores yet"}
        captionWraps
      />
      <StatTile
        label="Club"
        value={
          <span className="font-display text-base">{goalkeeper?.club || report.team || "—"}</span>
        }
        caption={goalkeeper?.league || report.competition || "League not recorded"}
      />
      <StatTile
        label="Nationality"
        value={
          <span className="inline-flex items-center gap-1.5 font-display text-base">
            {flag ? (
              <span aria-hidden="true" className="text-lg leading-none">
                {flag}
              </span>
            ) : null}
            {goalkeeper?.nationality || "—"}
          </span>
        }
        caption={goalkeeper?.age != null ? `Age ${goalkeeper.age}` : "Age not recorded"}
      />
    </section>
  );
}

/** The snapshot's "this match" figure: the change, big, with its direction. */
function DeltaChipLarge({ delta }: { delta: number }) {
  const rounded = Math.round(delta * 10) / 10;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        rounded > 0 ? "text-success" : rounded < 0 ? "text-warning" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
      {signed(delta)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pillars
// ---------------------------------------------------------------------------

export function PillarBreakdown({
  report,
  form,
  className,
}: {
  report: MatchReportRow;
  /** Null while the goalkeeper's other reports are still loading. */
  form: GoalkeeperForm | null;
  className?: string;
}) {
  return (
    <Panel title="RPM Pillar Scores" className={className}>
      <ul className="divide-y divide-border/60">
        {PILLAR_IDS.map((id) => (
          <PillarRow
            key={id}
            id={id}
            score={report.scores[id]}
            baseline={form?.pillarBaseline[id] ?? null}
            baselineCount={form?.baselineCount ?? 0}
          />
        ))}
      </ul>
      {form && form.baselineCount > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Arrows compare each pillar with this goalkeeper's average across{" "}
          {plural(form.baselineCount, "other report", "other reports")}.
        </p>
      ) : null}
      <ScoreScaleGuide className="mt-4 border-t border-border/60 pt-3" />
    </Panel>
  );
}

function PillarRow({
  id,
  score,
  baseline,
  baselineCount,
}: {
  id: PillarId;
  score: number | null;
  baseline: number | null;
  baselineCount: number;
}) {
  const tone = scoreTone(score);
  const delta = isValidScore(score) && baseline != null ? score - baseline : null;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_7.5rem]">
      <span className="min-w-0 text-sm font-medium leading-snug">{PILLAR_LABELS[id]}</span>
      <span className="flex items-center justify-end gap-2 md:order-last">
        <DeltaChip
          delta={delta}
          title={
            baseline != null
              ? `Average of ${plural(baselineCount, "other report", "other reports")}: ${baseline.toFixed(1)}`
              : undefined
          }
        />
        <span className={cn("w-10 text-right font-mono text-lg font-bold tabular-nums", tone.ink)}>
          {score != null ? `${score}/5` : "—"}
        </span>
      </span>
      <PipBar score={score} className="col-span-2 gap-1 md:col-span-1" pipClassName="h-2.5" />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Standouts
// ---------------------------------------------------------------------------

export function PillarStandouts({ report }: { report: MatchReportRow }) {
  const { strongest, focus } = pillarStandouts(report.scores);
  return (
    <Panel title="Standouts">
      {!strongest ? (
        <p className="text-sm text-muted-foreground">No pillar scores recorded.</p>
      ) : (
        <div className="space-y-3">
          <Standout
            icon={TrendingUp}
            label="Strongest pillar"
            pillar={strongest.id}
            score={strongest.score}
          />
          {focus ? (
            <Standout icon={Target} label="Work-on pillar" pillar={focus.id} score={focus.score} />
          ) : (
            <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
              Level across every scored pillar.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

function Standout({
  icon: Icon,
  label,
  pillar,
  score,
}: {
  icon: typeof TrendingUp;
  label: string;
  pillar: PillarId;
  score: number;
}) {
  const tone = scoreTone(score);
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border px-3.5 py-3"
      style={{
        backgroundImage: `linear-gradient(90deg, color-mix(in oklab, ${BAND_COLOR[tone.band]} 12%, transparent), transparent 70%)`,
      }}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-0.5", tone.bar)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="gk-stat-label inline-flex items-center gap-1.5">
            <Icon className="size-3" aria-hidden="true" />
            {label}
          </div>
          <div className="mt-1 text-sm font-semibold leading-snug">{PILLAR_LABELS[pillar]}</div>
        </div>
        <span className={cn("shrink-0 font-mono text-2xl font-bold tabular-nums", tone.ink)}>
          {score}
          <span className="text-xs font-medium text-muted-foreground">/5</span>
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent form
// ---------------------------------------------------------------------------

/** "20 Sept" — the strip has no room for the year. */
function shortDate(iso: string | null): string {
  if (!iso) return "Undated";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function FormStrip({ report, form }: { report: MatchReportRow; form: GoalkeeperForm }) {
  return (
    <Panel
      title="Recent form"
      aside={
        <span className="text-[11px] text-muted-foreground">
          {plural(form.form.length, "report", "reports")} up to this match
        </span>
      }
    >
      <ol className="flex items-end gap-2" aria-label="Match ratings, oldest first">
        {form.form.map((entry) => {
          const tone = scoreTone(entry.average);
          const current = entry.report_id === report.report_id;
          const height = isValidScore(entry.average) ? (entry.average / 5) * 100 : 8;
          const label = `${shortDate(entry.match_date)}${entry.opponent ? ` v ${entry.opponent}` : ""}: ${
            entry.average != null ? entry.average.toFixed(1) : "no score"
          }`;
          const bar = (
            <>
              <span className={cn("font-mono text-[11px] font-bold tabular-nums", tone.ink)}>
                {entry.average != null ? entry.average.toFixed(1) : "—"}
              </span>
              <span className="flex h-28 w-full items-end">
                <span
                  className={cn(
                    "w-full rounded-t-md transition-[filter] group-hover:brightness-110",
                    tone.bar,
                    current && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card",
                  )}
                  style={{ height: `${height}%` }}
                />
              </span>
              <span
                className={cn(
                  "w-full truncate text-center text-[10px]",
                  current ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {shortDate(entry.match_date)}
              </span>
            </>
          );
          return (
            <li key={entry.report_id} className="min-w-0 flex-1">
              {current ? (
                <div
                  className="flex flex-col items-center gap-1.5"
                  aria-current="true"
                  aria-label={`This match, ${label}`}
                >
                  {bar}
                </div>
              ) : (
                <Link
                  to="/reports/$reportId"
                  params={{ reportId: entry.report_id }}
                  aria-label={`Open the report for ${label}`}
                  className="group flex flex-col items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {bar}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {form.form.length < 2 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          More bars appear here as further reports are filed on this goalkeeper.
        </p>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Mentor's verdict
// ---------------------------------------------------------------------------

export function MentorVerdict({
  report,
  className,
}: {
  report: MatchReportRow;
  className?: string;
}) {
  const coach = report.coach?.trim() || "";
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
      <Quote
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-5 size-14 text-primary-ink/20"
      />
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] font-mono text-foreground">
        Mentor's verdict
      </h2>
      <p className="mt-3 max-w-[75ch] whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground/90">
        {report.comments || (
          <span className="italic text-muted-foreground">No comments recorded.</span>
        )}
      </p>
      <footer className="mt-5 flex items-center gap-3 border-t border-border/60 pt-4">
        <Avatar initials={initialsOf(coach || "?")} size={36} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{coach || "Mentor not recorded"}</div>
          <div className="text-xs text-muted-foreground">
            RPM Mentor · {formatMatchDate(report.match_date)}
          </div>
        </div>
      </footer>
    </section>
  );
}
