/**
 * One report, read against the goalkeeper's other reports.
 *
 * A report on its own says "Protect the Air 3/5". Whether that is a good day
 * or a bad one depends on the goalkeeper, so the full report and the insights
 * pane both put it beside his own record: his average, his recent form, and
 * where this match sits in it.
 *
 * Everything here is derived from `MatchReportRow`s already on the client —
 * nothing is fetched and nothing is invented. A score outside 1–5 is not a
 * score and is left out of every mean, the same rule the goalkeeper profile
 * applies, so the two screens cannot disagree about a goalkeeper's average.
 */
import { normalisePersonName } from "@/lib/goalkeeper-player-link";
import { PILLAR_IDS, type MatchReportRow, type PillarId } from "@/lib/match-reports/schema";

/** How many reports the recent-form strip shows. */
export const FORM_WINDOW = 6;

export function isValidScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100;
}

/** Newest match first; undated reports sink to the bottom. */
function newestFirst(a: MatchReportRow, b: MatchReportRow): number {
  if (!a.match_date && !b.match_date) return 0;
  if (!a.match_date) return 1;
  if (!b.match_date) return -1;
  return b.match_date.localeCompare(a.match_date);
}

export interface GoalkeeperForm {
  /** Every report on this goalkeeper, newest match first, this one included. */
  reports: MatchReportRow[];
  /** Mean of every scored report on this goalkeeper. */
  overallAverage: number | null;
  /** Mean of the five most recent scored reports. */
  last5Average: number | null;
  /** Mean of the goalkeeper's other scored reports: what this one is read against. */
  averageBaseline: number | null;
  /** Per pillar, the mean of the goalkeeper's other reports. */
  pillarBaseline: Record<PillarId, number | null>;
  /** How many other reports the baselines are built from. */
  baselineCount: number;
  /**
   * The reports leading up to and including this one, oldest first, so the
   * strip reads left to right like a season.
   */
  form: MatchReportRow[];
}

export function goalkeeperForm(all: MatchReportRow[], current: MatchReportRow): GoalkeeperForm {
  const target = normalisePersonName(current.goalkeeper);
  const reports = all.filter((report) => normalisePersonName(report.goalkeeper) === target);
  // A report not yet in the list (a stale cache, a fresh submission) is still
  // this goalkeeper's report, so it is always part of his record.
  if (!reports.some((report) => report.report_id === current.report_id)) reports.push(current);
  reports.sort(newestFirst);

  const others = reports.filter((report) => report.report_id !== current.report_id);

  const pillarBaseline = {} as Record<PillarId, number | null>;
  for (const id of PILLAR_IDS) {
    pillarBaseline[id] = mean(others.map((report) => report.scores[id]).filter(isValidScore));
  }

  const scored = reports.map((report) => report.average).filter(isValidScore);
  const index = reports.findIndex((report) => report.report_id === current.report_id);

  return {
    reports,
    overallAverage: mean(scored),
    last5Average: mean(scored.slice(0, 5)),
    averageBaseline: mean(others.map((report) => report.average).filter(isValidScore)),
    pillarBaseline,
    baselineCount: others.length,
    form: reports.slice(index, index + FORM_WINDOW).reverse(),
  };
}

export interface PillarStandouts {
  strongest: { id: PillarId; score: number } | null;
  /** Null when every scored pillar is level: there is no weakest one. */
  focus: { id: PillarId; score: number } | null;
}

/** The best and the weakest scored pillar on one report. Ties go to the first. */
export function pillarStandouts(scores: MatchReportRow["scores"]): PillarStandouts {
  let strongest: PillarStandouts["strongest"] = null;
  let focus: PillarStandouts["focus"] = null;
  for (const id of PILLAR_IDS) {
    const score = scores[id];
    if (!isValidScore(score)) continue;
    if (!strongest || score > strongest.score) strongest = { id, score };
    if (!focus || score < focus.score) focus = { id, score };
  }
  if (strongest && focus && strongest.score === focus.score) focus = null;
  return { strongest, focus };
}
