import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { InsightWorkbench } from "@/components/insight-workbench";
import { DetailFact } from "@/components/workbench-primitives";
import { initialsOf } from "@/lib/initials";
import {
  PILLAR_IDS,
  PILLAR_LABELS,
  type MatchReportRow,
  type PillarId,
} from "@/lib/match-reports/schema";

interface MatchReportWorkbenchProps {
  reports: MatchReportRow[];
  periodLabel: string;
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

/**
 * Scores run 1–5. Anything at 3.5+ reads as a strong outing, below 2.5 as one
 * that needs attention; the middle band stays neutral so the list isn't a wall
 * of colour.
 */
function scoreTone(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 3.5) return "text-success";
  if (score < 2.5) return "text-warning";
  return "text-foreground";
}

function PillarScore({ pillar, score }: { pillar: PillarId; score: number | null }) {
  const filled = score ?? 0;
  return (
    <li className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {PILLAR_LABELS[pillar]}
      </span>
      <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={`h-1.5 w-4 rounded-sm ${step <= filled ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </span>
      <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
        {score != null ? `${score}/5` : "—"}
      </span>
    </li>
  );
}

export function MatchReportWorkbench({ reports, periodLabel }: MatchReportWorkbenchProps) {
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
        return [
          {
            label: "Reports",
            mono: true,
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
          },
          { label: "Period", value: periodLabel },
          {
            label: "Average score",
            mono: true,
            valueClassName: scoreTone(average),
            value: average != null ? average.toFixed(2) : "—",
          },
        ];
      }}
      rowAriaLabel={(report) =>
        `Show details for ${report.goalkeeper} on ${formatMatchDate(report.match_date)}`
      }
      rowOf={(report) => ({
        initials: initialsOf(report.goalkeeper),
        title: report.goalkeeper,
        subtitle: fixtureLabel(report),
        middleTop: report.coach || "Mentor not recorded",
        // Yellow marks the mentor's written verdict — the part worth reading.
        middleBottom:
          report.comments.trim() || report.competition?.trim() || "No comments recorded",
        middleBottomHighlighted: Boolean(report.comments.trim()),
        rightTop: report.average != null ? report.average.toFixed(2) : "—",
        rightTopClassName: `text-sm font-semibold ${scoreTone(report.average)}`,
        rightBottom: formatMatchDate(report.match_date),
      })}
      detailHeader={(report) => ({
        title: report.goalkeeper,
        subtitle: `${fixtureLabel(report)} · ${formatMatchDate(report.match_date)}`,
        rightValue: report.average != null ? report.average.toFixed(2) : "—",
        rightValueClassName: scoreTone(report.average),
        rightLabel: "Av score",
      })}
      renderDetail={(report) => (
        <>
          <dl className="mt-5 grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
            <DetailFact label="Mentor" value={report.coach || "Not recorded"} />
            <DetailFact label="Team" value={report.team?.trim() || "Not recorded"} />
            <DetailFact label="Opponent" value={report.opponent?.trim() || "Not recorded"} />
            <DetailFact label="Competition" value={report.competition?.trim() || "Not recorded"} />
            <DetailFact label="Match date" value={formatMatchDate(report.match_date)} />
          </dl>

          <section className="mt-5" aria-labelledby="selected-report-pillars">
            <h3
              id="selected-report-pillars"
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
            >
              RPM pillar scores
            </h3>
            <ul className="mt-3 space-y-2.5">
              {PILLAR_IDS.map((pillar) => (
                <PillarScore key={pillar} pillar={pillar} score={report.scores[pillar] ?? null} />
              ))}
            </ul>
          </section>

          <section className="mt-5" aria-labelledby="selected-report-comments">
            <h3
              id="selected-report-comments"
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
            >
              Comments
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
              {report.comments || "No comments recorded."}
            </p>
          </section>

          <Link
            to="/reports/$reportId"
            params={{ reportId: report.report_id }}
            className="mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent/40"
          >
            Open full report <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
      noMatchLabel="No match reports match these filters."
      placeholder="Select a match report to review its complete record."
    />
  );
}
